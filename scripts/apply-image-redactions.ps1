# Apply manifest-owned rectangles without generative image editing.
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string] $InputPath,

    [Parameter(Mandatory)]
    [string] $OutputPath,

    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string] $ManifestPath,

    [string[]] $Rectangle = @(),

    [switch] $Preview,

    [switch] $Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

if ([string]::IsNullOrWhiteSpace($ManifestPath) -eq ($Rectangle.Count -eq 0)) {
    throw 'Supply exactly one coordinate source: -ManifestPath or -Rectangle.'
}

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$outputExtension = [System.IO.Path]::GetExtension($resolvedOutput).ToLowerInvariant()

if ([System.StringComparer]::OrdinalIgnoreCase.Equals($resolvedInput, $resolvedOutput)) {
    throw 'OutputPath must differ from InputPath; the clean source is immutable.'
}

if ($outputExtension -notin @('.png', '.webp')) {
    throw 'OutputPath must end in .png or .webp.'
}

if ((Test-Path -LiteralPath $resolvedOutput) -and -not $Force) {
    throw "Output already exists. Choose another path or pass -Force: $resolvedOutput"
}

$outputDirectory = [System.IO.Path]::GetDirectoryName($resolvedOutput)
if (-not [string]::IsNullOrEmpty($outputDirectory)) {
    [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
}

$inputSha256 = (Get-FileHash -LiteralPath $resolvedInput -Algorithm SHA256).Hash
$resolvedManifest = $null
$manifestSha256 = $null
$sourceSha256Matches = $null
$reviewStatus = 'ad-hoc'
$referenceWidth = $null
$referenceHeight = $null
$rectangleSpecs = [System.Collections.Generic.List[object]]::new()
$rectangleSpecById = [System.Collections.Generic.Dictionary[string, object]]::new(
    [System.StringComparer]::Ordinal
)
$geometryGroups = [System.Collections.Generic.List[object]]::new()
$geometryExceptions = [System.Collections.Generic.List[object]]::new()

$source = [System.Drawing.Image]::FromFile($resolvedInput)
try {
    if (-not [string]::IsNullOrWhiteSpace($ManifestPath)) {
        $resolvedManifest = (Resolve-Path -LiteralPath $ManifestPath).Path
        $manifest = Get-Content -LiteralPath $resolvedManifest -Raw | ConvertFrom-Json

        if ($manifest.PSObject.Properties['schemaVersion'].Value -ne 1) {
            throw 'redaction.json schemaVersion must be 1.'
        }

        $reviewStatusProperty = $manifest.PSObject.Properties['reviewStatus']
        if ($null -eq $reviewStatusProperty -or
            [string]::IsNullOrWhiteSpace([string] $reviewStatusProperty.Value)) {
            $reviewStatus = 'proposed'
        }
        else {
            $reviewStatus = ([string] $reviewStatusProperty.Value).ToLowerInvariant()
        }
        if ($reviewStatus -notin @('proposed', 'auto-applied', 'approved')) {
            throw 'redaction.json reviewStatus must be proposed, auto-applied, or approved.'
        }

        $coordinateSpace = $manifest.PSObject.Properties['coordinateSpace'].Value
        if ($null -eq $coordinateSpace) {
            throw 'redaction.json must define coordinateSpace.'
        }

        $referenceWidth = [int] $coordinateSpace.PSObject.Properties['width'].Value
        $referenceHeight = [int] $coordinateSpace.PSObject.Properties['height'].Value
        if ($referenceWidth -le 0 -or $referenceHeight -le 0) {
            throw 'coordinateSpace width and height must be positive integers.'
        }

        $sourceProperty = $manifest.PSObject.Properties['source']
        $sourceRecord = if ($null -eq $sourceProperty) {
            $null
        }
        else {
            $sourceProperty.Value
        }
        if ($null -ne $sourceRecord) {
            $shaProperty = $sourceRecord.PSObject.Properties['sha256']
            if ($null -ne $shaProperty -and -not [string]::IsNullOrWhiteSpace([string] $shaProperty.Value)) {
                $manifestSha256 = ([string] $shaProperty.Value).ToUpperInvariant()
                if ($manifestSha256 -notmatch '^[0-9A-F]{64}$') {
                    throw 'source.sha256 must contain 64 hexadecimal characters.'
                }
                $sourceSha256Matches = $manifestSha256 -eq $inputSha256
                if (-not $sourceSha256Matches) {
                    Write-Warning 'The input SHA-256 differs from redaction.json; inspect a preview before publishing.'
                }
            }
        }

        $manifestRectangles = @($manifest.PSObject.Properties['rectangles'].Value)
        if ($manifestRectangles.Count -eq 0) {
            throw 'redaction.json must contain at least one rectangle.'
        }

        $rectangleIds = [System.Collections.Generic.HashSet[string]]::new(
            [System.StringComparer]::Ordinal
        )
        foreach ($item in $manifestRectangles) {
            $id = [string] $item.PSObject.Properties['id'].Value
            if ([string]::IsNullOrWhiteSpace($id)) {
                throw 'Every manifest rectangle must have a non-empty id.'
            }
            if (-not $rectangleIds.Add($id)) {
                throw "Every manifest rectangle id must be unique: $id"
            }

            $rectangleSpec = [pscustomobject]@{
                Id = $id
                Purpose = [string] $item.PSObject.Properties['purpose'].Value
                X = [int] $item.PSObject.Properties['x'].Value
                Y = [int] $item.PSObject.Properties['y'].Value
                Width = [int] $item.PSObject.Properties['width'].Value
                Height = [int] $item.PSObject.Properties['height'].Value
            }
            $rectangleSpecs.Add($rectangleSpec)
            $rectangleSpecById.Add($id, $rectangleSpec)
        }

        $geometryGroupsProperty = $manifest.PSObject.Properties['geometryGroups']
        $geometryGroupRecords = if ($null -eq $geometryGroupsProperty) {
            @()
        }
        else {
            @($geometryGroupsProperty.Value)
        }
        $geometryGroupIds = [System.Collections.Generic.HashSet[string]]::new(
            [System.StringComparer]::Ordinal
        )
        foreach ($group in $geometryGroupRecords) {
            if ($null -eq $group) {
                continue
            }

            $groupId = [string] $group.PSObject.Properties['id'].Value
            if ([string]::IsNullOrWhiteSpace($groupId)) {
                throw 'Every geometry group must have a non-empty id.'
            }
            if (-not $geometryGroupIds.Add($groupId)) {
                throw "Every geometry group id must be unique: $groupId"
            }

            $rule = ([string] $group.PSObject.Properties['rule'].Value).ToLowerInvariant()
            $rectangleIds = @($group.PSObject.Properties['rectangleIds'].Value | ForEach-Object {
                [string] $_
            })
            if ($rectangleIds.Count -lt 2) {
                throw "Geometry group $groupId must reference at least two rectangles."
            }

            $groupRectangles = @($rectangleIds | ForEach-Object {
                if (-not $rectangleSpecById.ContainsKey($_)) {
                    throw "Geometry group $groupId references an unknown rectangle: $_"
                }
                $rectangleSpecById[$_]
            })

            switch ($rule) {
                'uniform-width' {
                    $widthProperty = $group.PSObject.Properties['width']
                    if ($null -eq $widthProperty -or [int] $widthProperty.Value -le 0) {
                        throw "Geometry group $groupId must define a positive width."
                    }
                    $declaredWidth = [int] $widthProperty.Value
                    foreach ($groupRectangle in $groupRectangles) {
                        if ($groupRectangle.Width -ne $declaredWidth) {
                            throw "Geometry group $groupId requires every rectangle width to equal $declaredWidth."
                        }
                    }
                }
                'horizontal-mirror' {
                    if ($groupRectangles.Count -ne 2) {
                        throw "Horizontal-mirror geometry group $groupId must reference exactly two rectangles."
                    }
                    $leftRectangle = @($groupRectangles | Sort-Object X)[0]
                    $rightRectangle = @($groupRectangles | Sort-Object X)[1]
                    $expectedRightX = $referenceWidth - ($leftRectangle.X + $leftRectangle.Width)
                    if ($leftRectangle.Y -ne $rightRectangle.Y -or
                        $leftRectangle.Width -ne $rightRectangle.Width -or
                        $leftRectangle.Height -ne $rightRectangle.Height -or
                        $rightRectangle.X -ne $expectedRightX) {
                        throw "Geometry group $groupId must use equal-size rectangles mirrored across the coordinate space."
                    }
                }
                default {
                    throw "Geometry group $groupId has an unsupported rule: $rule"
                }
            }

            $geometryGroups.Add([pscustomobject]@{
                Id = $groupId
                Rule = $rule
                RectangleIds = $rectangleIds
            })
        }

        $geometryExceptionsProperty = $manifest.PSObject.Properties['geometryExceptions']
        $geometryExceptionRecords = if ($null -eq $geometryExceptionsProperty) {
            @()
        }
        else {
            @($geometryExceptionsProperty.Value)
        }
        $geometryExceptionIds = [System.Collections.Generic.HashSet[string]]::new(
            [System.StringComparer]::Ordinal
        )
        foreach ($exception in $geometryExceptionRecords) {
            if ($null -eq $exception) {
                continue
            }

            $exceptionId = [string] $exception.PSObject.Properties['id'].Value
            if ([string]::IsNullOrWhiteSpace($exceptionId)) {
                throw 'Every geometry exception must have a non-empty id.'
            }
            if (-not $geometryExceptionIds.Add($exceptionId)) {
                throw "Every geometry exception id must be unique: $exceptionId"
            }

            $reason = [string] $exception.PSObject.Properties['reason'].Value
            if ([string]::IsNullOrWhiteSpace($reason)) {
                throw "Geometry exception $exceptionId must explain its reason."
            }

            $rectangleIds = @(
                $exception.PSObject.Properties['rectangleIds'].Value | ForEach-Object {
                    [string] $_
                }
            )
            if ($rectangleIds.Count -lt 2) {
                throw "Geometry exception $exceptionId must reference at least two rectangles."
            }
            foreach ($rectangleId in $rectangleIds) {
                if (-not $rectangleSpecById.ContainsKey($rectangleId)) {
                    throw "Geometry exception $exceptionId references an unknown rectangle: $rectangleId"
                }
            }

            $geometryExceptions.Add([pscustomobject]@{
                Id = $exceptionId
                Reason = $reason
                RectangleIds = $rectangleIds
            })
        }
    }
    else {
        $referenceWidth = $source.Width
        $referenceHeight = $source.Height
        $index = 0
        foreach ($rectangleText in $Rectangle) {
            $index++
            $parts = @($rectangleText -split ',' | ForEach-Object { [int]::Parse($_.Trim()) })
            if ($parts.Count -ne 4) {
                throw "Rectangle must use x,y,width,height: $rectangleText"
            }

            $rectangleSpecs.Add([pscustomobject]@{
                Id = 'rectangle-{0:D3}' -f $index
                Purpose = 'ad-hoc'
                X = $parts[0]
                Y = $parts[1]
                Width = $parts[2]
                Height = $parts[3]
            })
        }
    }

    if (-not $Preview -and $null -ne $resolvedManifest -and $reviewStatus -eq 'proposed') {
        throw 'redaction.json is proposed. Use auto-applied for immediate output or approved after explicit approval.'
    }

    $scaleX = $source.Width / [double] $referenceWidth
    $scaleY = $source.Height / [double] $referenceHeight
    $appliedRectangles = [System.Collections.Generic.List[object]]::new()

    foreach ($spec in $rectangleSpecs) {
        if ($spec.X -lt 0 -or $spec.Y -lt 0 -or $spec.Width -le 0 -or $spec.Height -le 0) {
            throw "Rectangle $($spec.Id) has invalid reference coordinates."
        }

        $left = [int] [Math]::Round($spec.X * $scaleX, [MidpointRounding]::AwayFromZero)
        $top = [int] [Math]::Round($spec.Y * $scaleY, [MidpointRounding]::AwayFromZero)
        $right = [int] [Math]::Round(
            ($spec.X + $spec.Width) * $scaleX,
            [MidpointRounding]::AwayFromZero
        )
        $bottom = [int] [Math]::Round(
            ($spec.Y + $spec.Height) * $scaleY,
            [MidpointRounding]::AwayFromZero
        )
        $candidate = [System.Drawing.Rectangle]::FromLTRB($left, $top, $right, $bottom)

        if ($candidate.X -lt 0 -or $candidate.Y -lt 0 -or
            $candidate.Width -le 0 -or $candidate.Height -le 0 -or
            $candidate.Right -gt $source.Width -or $candidate.Bottom -gt $source.Height) {
            throw "Rectangle $($spec.Id) falls outside the $($source.Width)x$($source.Height) input."
        }

        $appliedRectangles.Add([pscustomobject]@{
            Id = $spec.Id
            Purpose = $spec.Purpose
            Rectangle = $candidate
        })
    }

    $canvas = [System.Drawing.Bitmap]::new(
        $source.Width,
        $source.Height,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    try {
        $graphics = [System.Drawing.Graphics]::FromImage($canvas)
        try {
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::None
            $graphics.DrawImageUnscaled($source, 0, 0)

            if ($Preview) {
                $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
                $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
                $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::Lime, 4)
                $labelFont = [System.Drawing.Font]::new(
                    [System.Drawing.FontFamily]::GenericSansSerif,
                    14,
                    [System.Drawing.FontStyle]::Bold,
                    [System.Drawing.GraphicsUnit]::Pixel
                )
                $labelTextBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::Lime)
                $labelBackgroundBrush = [System.Drawing.SolidBrush]::new(
                    [System.Drawing.Color]::FromArgb(255, 0, 0, 0)
                )
                try {
                    foreach ($item in $appliedRectangles) {
                        $graphics.DrawRectangle($pen, $item.Rectangle)
                    }

                    foreach ($item in $appliedRectangles) {
                        $label = [string] $item.Id
                        $measured = $graphics.MeasureString($label, $labelFont)
                        $labelWidth = [int] [Math]::Ceiling($measured.Width) + 8
                        $labelHeight = [int] [Math]::Ceiling($measured.Height) + 4

                        if ($item.Rectangle.Y - $labelHeight - 2 -ge 0) {
                            $labelY = $item.Rectangle.Y - $labelHeight - 2
                        }
                        elseif ($item.Rectangle.Bottom + $labelHeight + 2 -le $source.Height) {
                            $labelY = $item.Rectangle.Bottom + 2
                        }
                        else {
                            $labelY = $item.Rectangle.Y
                        }

                        $maximumLabelX = [Math]::Max(0, $source.Width - $labelWidth)
                        $labelX = [Math]::Min(
                            $maximumLabelX,
                            [Math]::Max(0, $item.Rectangle.X)
                        )
                        $labelRectangle = [System.Drawing.Rectangle]::new(
                            $labelX,
                            $labelY,
                            $labelWidth,
                            $labelHeight
                        )
                        $graphics.FillRectangle($labelBackgroundBrush, $labelRectangle)
                        $graphics.DrawString(
                            $label,
                            $labelFont,
                            $labelTextBrush,
                            [single] ($labelX + 4),
                            [single] ($labelY + 2)
                        )
                    }
                }
                finally {
                    $pen.Dispose()
                    $labelFont.Dispose()
                    $labelTextBrush.Dispose()
                    $labelBackgroundBrush.Dispose()
                }
            }
            else {
                $brush = [System.Drawing.SolidBrush]::new(
                    [System.Drawing.Color]::FromArgb(255, 0, 0, 0)
                )
                try {
                    foreach ($item in $appliedRectangles) {
                        $graphics.FillRectangle($brush, $item.Rectangle)
                    }
                }
                finally {
                    $brush.Dispose()
                }
            }
        }
        finally {
            $graphics.Dispose()
        }

        $temporaryPng = Join-Path $outputDirectory (
            '.{0}.{1}.tmp.png' -f [System.IO.Path]::GetFileNameWithoutExtension($resolvedOutput),
            [System.Guid]::NewGuid().ToString('N')
        )
        $temporaryWebp = $null
        try {
            $canvas.Save($temporaryPng, [System.Drawing.Imaging.ImageFormat]::Png)
            if ($outputExtension -eq '.png') {
                Move-Item -LiteralPath $temporaryPng -Destination $resolvedOutput -Force
            }
            else {
                $temporaryWebp = Join-Path $outputDirectory (
                    '.{0}.{1}.tmp.webp' -f [System.IO.Path]::GetFileNameWithoutExtension($resolvedOutput),
                    [System.Guid]::NewGuid().ToString('N')
                )
                $ffmpeg = Get-Command ffmpeg -ErrorAction Stop
                & $ffmpeg.Source -hide_banner -loglevel error -n -i $temporaryPng `
                    -map_metadata -1 -c:v libwebp -lossless 1 -compression_level 6 `
                    -pix_fmt bgra $temporaryWebp
                if ($LASTEXITCODE -ne 0) {
                    throw "ffmpeg WebP conversion failed with exit code $LASTEXITCODE."
                }
                Move-Item -LiteralPath $temporaryWebp -Destination $resolvedOutput -Force
            }
        }
        finally {
            if (Test-Path -LiteralPath $temporaryPng) {
                Remove-Item -LiteralPath $temporaryPng -Force
            }
            if ($null -ne $temporaryWebp -and (Test-Path -LiteralPath $temporaryWebp)) {
                Remove-Item -LiteralPath $temporaryWebp -Force
            }
        }

        [pscustomobject]@{
            InputPath = $resolvedInput
            InputSha256 = $inputSha256
            ManifestPath = $resolvedManifest
            ManifestSourceSha256 = $manifestSha256
            SourceSha256Matches = $sourceSha256Matches
            ReviewStatus = $reviewStatus
            OutputPath = $resolvedOutput
            ReferenceWidth = $referenceWidth
            ReferenceHeight = $referenceHeight
            Width = $source.Width
            Height = $source.Height
            ScaleX = $scaleX
            ScaleY = $scaleY
            Mode = if ($Preview) { 'preview' } else { 'redacted' }
            GeometryGroups = @($geometryGroups)
            GeometryExceptions = @($geometryExceptions)
            Rectangles = @($appliedRectangles | ForEach-Object {
                [pscustomobject]@{
                    Id = $_.Id
                    Purpose = $_.Purpose
                    X = $_.Rectangle.X
                    Y = $_.Rectangle.Y
                    Width = $_.Rectangle.Width
                    Height = $_.Rectangle.Height
                }
            })
        } | ConvertTo-Json -Depth 4
    }
    finally {
        $canvas.Dispose()
    }
}
finally {
    $source.Dispose()
}

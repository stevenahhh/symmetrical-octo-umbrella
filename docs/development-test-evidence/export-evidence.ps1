$ErrorActionPreference = "Stop"

$EvidenceDir = $PSScriptRoot
$HtmlPath = Join-Path $EvidenceDir "index.html"
$PdfPath = Join-Path $EvidenceDir "development-test-evidence.pdf"
$PngDir = Join-Path $EvidenceDir "pdf-pages"
$HtmlUrl = ([System.Uri]::new($HtmlPath)).AbsoluteUri
$PdfExporter = Join-Path $EvidenceDir "export-pdf.cjs"
$PngRenderer = Join-Path $EvidenceDir "render-pdf.py"

npx --yes --package=playwright node $PdfExporter $HtmlUrl $PdfPath
uv run $PngRenderer $PdfPath $PngDir

Write-Host "Created $PdfPath"
Write-Host "Created eight PNG pages in $PngDir"

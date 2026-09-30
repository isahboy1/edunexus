<?php
// One-off helper: extract text from the AKCILS registration procedure PDF
spl_autoload_register(function ($class) {
    $prefix = 'Smalot\\PdfParser\\';
    if (strpos($class, $prefix) !== 0) return;
    $rel = substr($class, strlen($prefix));
    $base = 'C:/Users/isahb/AppData/Local/Temp/pdfparser-2.11.0/src/Smalot/PdfParser/';
    $file = $base . str_replace('\\', '/', $rel) . '.php';
    if (file_exists($file)) require $file;
});
$file = $argv[1] ?? 'C:/Users/isahb/Downloads/Registration_proceedure.pdf';
$parser = new Smalot\PdfParser\Parser();
$doc = $parser->parseFile($file);
echo $doc->getText();

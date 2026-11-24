<?php
/*
 * Used by start.bat on Windows (Laragon): makes backend/.env point at Laragon's MySQL
 * and creates the database if it is missing. Exit code 2 = MySQL is not running.
 */
$env = __DIR__.'/../backend/.env';
$example = __DIR__.'/../backend/.env.example';
if (! file_exists($env)) {
    copy($example, $env);
}
$want = [
    'DB_CONNECTION' => 'mysql',
    'DB_HOST' => '127.0.0.1',
    'DB_PORT' => '3306',
    'DB_DATABASE' => 'af_office',
    'DB_USERNAME' => 'root',
    'DB_PASSWORD' => '',
];
$lines = preg_split('/\r?\n/', rtrim(file_get_contents($env)));
foreach ($want as $key => $value) {
    $found = false;
    foreach ($lines as $i => $line) {
        if (preg_match('/^#?\s*'.$key.'=/', $line)) {
            $lines[$i] = $key.'='.$value;
            $found = true;
            break;
        }
    }
    if (! $found) {
        $lines[] = $key.'='.$value;
    }
}
file_put_contents($env, implode(PHP_EOL, $lines).PHP_EOL);
echo "    settings: OK\n";

try {
    $pdo = new PDO('mysql:host=127.0.0.1;port=3306', 'root', '', [PDO::ATTR_TIMEOUT => 5]);
    $pdo->exec('CREATE DATABASE IF NOT EXISTS af_office CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    echo "    MySQL: OK\n";
} catch (Throwable $e) {
    echo "    MySQL: NOT RUNNING (".$e->getMessage().")\n";
    exit(2);
}

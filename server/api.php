<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

$config_file = __DIR__ . '/config.php';
if (!file_exists($config_file)) {
    http_response_code(503);
    echo json_encode(['error' => 'config.php not found on server']);
    exit;
}
require_once $config_file;

$method  = $_SERVER['REQUEST_METHOD'];
$input   = json_decode(file_get_contents('php://input'), true) ?? [];
$action_get  = $_GET['action'] ?? '';
$action_post = $input['action'] ?? '';

// === LOGIN (no session required) ===
if ($method === 'POST' && $action_post === 'login') {
    if (isset($input['password']) && $input['password'] === APP_PASSWORD) {
        $_SESSION['authenticated'] = true;
        echo json_encode(['ok' => true]);
    } else {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Wrong password']);
    }
    exit;
}

// === AUTH CHECK ===
if (empty($_SESSION['authenticated'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// === DB CONNECTION ===
try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'DB connection failed']);
    exit;
}

// GET ?action=load_all
if ($method === 'GET' && $action_get === 'load_all') {
    $rows   = $pdo->query('SELECT `key`, `value` FROM kv_store')->fetchAll(PDO::FETCH_ASSOC);
    $result = [];
    foreach ($rows as $row) {
        $result[$row['key']] = $row['value'];
    }
    echo json_encode($result);
    exit;
}

// POST save single key
if ($method === 'POST' && $action_post === 'save') {
    $key   = $input['key']   ?? null;
    $value = $input['value'] ?? null;
    if ($key === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing key']);
        exit;
    }
    $stmt = $pdo->prepare(
        'INSERT INTO kv_store (`key`, `value`) VALUES (:k, :v)
         ON DUPLICATE KEY UPDATE `value` = :v2, updated_at = NOW()'
    );
    $stmt->execute([':k' => $key, ':v' => $value, ':v2' => $value]);
    echo json_encode(['ok' => true]);
    exit;
}

// POST save_all (auto-migration on first run)
if ($method === 'POST' && $action_post === 'save_all') {
    $data = $input['data'] ?? [];
    $stmt = $pdo->prepare(
        'INSERT INTO kv_store (`key`, `value`) VALUES (:k, :v)
         ON DUPLICATE KEY UPDATE `value` = :v2, updated_at = NOW()'
    );
    foreach ($data as $k => $v) {
        $stmt->execute([':k' => $k, ':v' => $v, ':v2' => $v]);
    }
    echo json_encode(['ok' => true, 'count' => count($data)]);
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'Unknown action']);

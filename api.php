<?php
// =========================
// 기본 설정
// =========================
ini_set('display_errors', 1); // 운영 시 0
error_reporting(E_ALL);
header('Content-Type: application/json; charset=utf-8');

function jsonExit($data) {
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// =========================
// .env 로드
// =========================
$envFile = __DIR__ . '/.env';
if (!file_exists($envFile)) {
    jsonExit(['error' => '.env 파일 없음']);
}

$env = [];
$lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
foreach ($lines as $line) {
    if (strpos(trim($line), '#') === 0) continue;
    if (!str_contains($line, '=')) continue;
    [$k, $v] = explode('=', $line, 2);
    $env[trim($k)] = trim($v);
}

// 필수 값 체크
foreach (['RD_API_KEY','DB_HOST','DB_NAME','DB_USER','DB_PASS'] as $k) {
    if (empty($env[$k])) {
        jsonExit(['error' => "$k 값이 .env에 없음"]);
    }
}

// =========================
// DB 연결
// =========================
$conn = new mysqli(
    $env['DB_HOST'],
    $env['DB_USER'],
    $env['DB_PASS'],
    $env['DB_NAME']
);

if ($conn->connect_error) {
    jsonExit(['error' => 'DB 연결 실패: ' . $conn->connect_error]);
}

// =========================
// Real-Debrid API 함수
// =========================
function rd_api_call($endpoint, $key, $data = [], $method = "GET") {
    $ch = curl_init("https://api.real-debrid.com/rest/1.0/$endpoint");

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            "Authorization: Bearer $key"
        ],
        CURLOPT_SSL_VERIFYPEER => false
    ]);

    if ($method === "POST") {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data));
    } elseif ($method === "DELETE") {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "DELETE");
    }

    $res = curl_exec($ch);
    if ($res === false) {
        $err = curl_error($ch);
        curl_close($ch);
        return ['error' => $err];
    }

    curl_close($ch);
    return json_decode($res, true);
}

// =========================
// API 라우팅
// =========================
$action = $_GET['action'] ?? '';

switch ($action) {

    case 'list':
        $res = rd_api_call("torrents", $env['RD_API_KEY']);
        jsonExit($res);
        break;

    case 'add':
        $magnet = $_POST['magnet'] ?? '';
        if (!$magnet) jsonExit(['error' => 'magnet 없음']);

        $res = rd_api_call(
            "torrents/addMagnet",
            $env['RD_API_KEY'],
            ['magnet' => $magnet],
            "POST"
        );

        if (!empty($res['id'])) {
            rd_api_call(
                "torrents/selectFiles/{$res['id']}",
                $env['RD_API_KEY'],
                ['files' => 'all'],
                "POST"
            );

            $stmt = $conn->prepare(
                "INSERT IGNORE INTO rd_history (rd_id) VALUES (?)"
            );
            $stmt->bind_param("s", $res['id']);
            $stmt->execute();
        }

        jsonExit($res);
        break;

    case 'delete':
        $id = $_POST['id'] ?? '';
        if (!$id) jsonExit(['error' => 'id 없음']);

        $res = rd_api_call(
            "torrents/delete/$id",
            $env['RD_API_KEY'],
            [],
            "DELETE"
        );

        jsonExit($res);
        break;

    default:
        jsonExit(['error' => 'invalid action']);
}

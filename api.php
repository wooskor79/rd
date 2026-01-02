<?php
// 에러 확인을 위해 잠시 켜둠
ini_set('display_errors', 1); 
error_reporting(E_ALL);
header('Content-Type: application/json; charset=utf-8');

function jsonExit($data) {
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// 1. .env 파일 로더
$envPath = __DIR__ . '/.env';
if (!file_exists($envPath)) jsonExit(['error' => '.env 파일이 없습니다.']);

$lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
$env = [];
foreach ($lines as $line) {
    if (strpos(trim($line), '#') === 0) continue;
    $parts = explode('=', $line, 2);
    if (count($parts) === 2) $env[trim($parts[0])] = trim($parts[1]);
}

// 2. DB 접속
try {
    $conn = new mysqli($env['DB_HOST'], $env['DB_USER'], $env['DB_PASS'], $env['DB_NAME'], (int)$env['DB_PORT']);
    if ($conn->connect_error) throw new Exception("DB 접속 실패: " . $conn->connect_error);
    $conn->set_charset("utf8mb4");
} catch (Exception $e) {
    // 연결 실패 시 JSON으로 에러 반환
    jsonExit(['error' => $e->getMessage()]);
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';

// 3. API 라우팅

// (1) 목록 조회 (최근 7일)
if ($action === 'list') {
    $sql = "SELECT rd_id, alias, created_at FROM rd_history WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) ORDER BY created_at DESC";
    $result = $conn->query($sql);
    $list = [];
    
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            // RD API 호출하여 실시간 정보 가져오기
            $info = rd_api_call("torrents/info/" . $row['rd_id'], $env['RD_API_KEY']);
            if ($info && !isset($info['error'])) {
                $row['info'] = $info; // 진행률, 파일목록, 링크 등이 여기에 포함됨
                $list[] = $row;
            }
        }
    }
    jsonExit($list);
} 

// (2) 마그넷 추가
elseif ($action === 'addMagnet' || isset($_GET['m'])) {
    $magnet = $_GET['m'] ?? $_POST['magnet'] ?? '';
    if ($magnet) {
        $res = rd_api_call("torrents/addMagnet", $env['RD_API_KEY'], ["magnet" => $magnet], "POST");
        if (isset($res['id'])) {
            rd_api_call("torrents/selectFiles/{$res['id']}", $env['RD_API_KEY'], ["files" => "all"], "POST");
            
            // DB에 기록
            $stmt = $conn->prepare("INSERT IGNORE INTO rd_history (rd_id) VALUES (?)");
            $stmt->bind_param("s", $res['id']);
            $stmt->execute();
        }
    }
    if (isset($_GET['m'])) exit("<script>alert('RD 전송 성공'); window.close();</script>");
    jsonExit(['status' => 'success']);
} 

// (3) 삭제
elseif ($action === 'delete') {
    $rd_id = $_POST['rd_id'] ?? '';
    // RD에서 삭제
    rd_api_call("torrents/delete/$rd_id", $env['RD_API_KEY'], [], "DELETE");
    // DB에서 삭제
    $conn->query("DELETE FROM rd_history WHERE rd_id = '" . $conn->real_escape_string($rd_id) . "'");
    jsonExit(['status' => 'success']);
}

// (4) 별명(Alias) 업데이트 [새로 추가된 기능]
elseif ($action === 'updateAlias') {
    $rd_id = $_POST['rd_id'] ?? '';
    $alias = $_POST['alias'] ?? '';
    
    $stmt = $conn->prepare("UPDATE rd_history SET alias = ? WHERE rd_id = ?");
    $stmt->bind_param("ss", $alias, $rd_id);
    $stmt->execute();
    jsonExit(['status' => 'success']);
}

// RD API 통신 함수
function rd_api_call($endpoint, $key, $data = [], $method = "GET") {
    $ch = curl_init("https://api.real-debrid.com/rest/1.0/$endpoint");
    $headers = ["Authorization: Bearer $key"];
    if ($method === "POST") {
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data));
    } elseif ($method === "DELETE") {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "DELETE");
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $res = curl_exec($ch);
    curl_close($ch);
    return json_decode($res, true);
}
?>
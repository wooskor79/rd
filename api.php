<?php
ini_set('display_errors', 0);
header('Content-Type: application/json; charset=utf-8');

function jsonExit($data) {
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// .env 로드
$env = [];
if (file_exists(__DIR__ . '/.env')) {
    $lines = file(__DIR__ . '/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        if (str_contains($line, '=')) {
            [$k, $v] = explode('=', $line, 2);
            $env[trim($k)] = trim($v);
        }
    }
}

// DB 연결
$conn = new mysqli($env['DB_HOST'] ?? 'localhost', $env['DB_USER'], $env['DB_PASS'], $env['DB_NAME']);
if ($conn->connect_error) {
    jsonExit(['error' => 'DB 연결 실패: ' . $conn->connect_error]);
}

// RD API 함수
function rd_api_call($endpoint, $key, $data = [], $method = "GET") {
    $ch = curl_init("https://api.real-debrid.com/rest/1.0/$endpoint");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ["Authorization: Bearer $key"],
        CURLOPT_SSL_VERIFYPEER => false
    ]);
    if ($method === "POST") {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data));
    } elseif ($method === "DELETE") {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "DELETE");
    } elseif ($method === "PUT") {
        curl_setopt($ch, CURLOPT_PUT, true);
    }
    $res = curl_exec($ch);
    curl_close($ch);
    return json_decode($res, true);
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'list':
        $rd_list = rd_api_call("torrents", $env['RD_API_KEY']);
        if (isset($rd_list['error'])) jsonExit($rd_list);
        if (!is_array($rd_list)) $rd_list = [];

        $aliases = [];
        $result = $conn->query("SELECT rd_id, alias FROM rd_history");
        if ($result) {
            while ($row = $result->fetch_assoc()) {
                $aliases[$row['rd_id']] = $row['alias'];
            }
        }

        foreach ($rd_list as &$item) {
            $item['alias'] = $aliases[$item['id']] ?? '';
        }
        jsonExit($rd_list);
        break;

    // [추가됨] 특정 토렌트 상세 정보(파일 목록 등) 가져오기
    case 'info':
        $id = $_GET['id'] ?? '';
        if (!$id) jsonExit(['error' => 'ID required']);
        $res = rd_api_call("torrents/info/$id", $env['RD_API_KEY']);
        jsonExit($res);
        break;

    case 'addMagnet':
        $magnet = $_POST['magnet'] ?? '';
        $res = rd_api_call("torrents/addMagnet", $env['RD_API_KEY'], ['magnet' => $magnet], "POST");
        if (!empty($res['id'])) {
            rd_api_call("torrents/selectFiles/{$res['id']}", $env['RD_API_KEY'], ['files' => 'all'], "POST");
            $stmt = $conn->prepare("INSERT IGNORE INTO rd_history (rd_id) VALUES (?)");
            $stmt->bind_param("s", $res['id']);
            $stmt->execute();
        }
        jsonExit($res);
        break;

    case 'updateAlias':
        $rd_id = $_POST['rd_id'] ?? '';
        $alias = $_POST['alias'] ?? '';
        $stmt = $conn->prepare("INSERT INTO rd_history (rd_id, alias) VALUES (?, ?) ON DUPLICATE KEY UPDATE alias = ?");
        $stmt->bind_param("sss", $rd_id, $alias, $alias);
        $stmt->execute();
        jsonExit(['success' => true]);
        break;

    case 'delete':
        $id = $_POST['rd_id'] ?? '';
        rd_api_call("torrents/delete/$id", $env['RD_API_KEY'], [], "DELETE");
        $stmt = $conn->prepare("DELETE FROM rd_history WHERE rd_id = ?");
        $stmt->bind_param("s", $id);
        $stmt->execute();
        jsonExit(['success' => true]);
        break;
        
    case 'uploadTorrent':
        if (empty($_FILES['file']['tmp_name'])) jsonExit(['error' => '파일 없음']);
        $ch = curl_init("https://api.real-debrid.com/rest/1.0/torrents/addTorrent");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer " . $env['RD_API_KEY']]);
        curl_setopt($ch, CURLOPT_PUT, true);
        $fp = fopen($_FILES['file']['tmp_name'], 'r');
        curl_setopt($ch, CURLOPT_INFILE, $fp);
        curl_setopt($ch, CURLOPT_INFILESIZE, filesize($_FILES['file']['tmp_name']));
        $res = curl_exec($ch);
        curl_close($ch);
        fclose($fp);
        $json = json_decode($res, true);
        if (!empty($json['id'])) {
             rd_api_call("torrents/selectFiles/{$json['id']}", $env['RD_API_KEY'], ['files' => 'all'], "POST");
             $stmt = $conn->prepare("INSERT IGNORE INTO rd_history (rd_id) VALUES (?)");
             $stmt->bind_param("s", $json['id']);
             $stmt->execute();
        }
        jsonExit($json);
        break;

    default:
        jsonExit(['error' => 'Invalid Action']);
}
?>
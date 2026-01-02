-- 1. 데이터베이스가 없으면 생성
CREATE DATABASE IF NOT EXISTS common_database_server;

-- 2. 해당 데이터베이스 사용
USE common_database_server;

-- 3. 테이블 생성
CREATE TABLE IF NOT EXISTS rd_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rd_id VARCHAR(50) NOT NULL UNIQUE,   -- RD 토렌트 ID
    alias VARCHAR(255) DEFAULT NULL,      -- 사용자 별칭
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (created_at)
);
let deletingIds = new Set();
let openedFiles = new Set();   // 현재 펼쳐진 파일 목록 ID 저장
let fileCache = {};            // 파일 목록 데이터 캐싱 (API 호출 절약)

function addLog(msg, type = 'info') {
    const logArea = document.getElementById('logArea');
    const time = new Date().toLocaleTimeString('ko-KR');
    let color = '#cbd5e1';
    if(type === 'error') color = '#f87171';
    if(type === 'success') color = '#4ade80';

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span style="color:#64748b; font-size:0.8em">[${time}]</span> <span style="color:${color}">${msg}</span>`;
    logArea.prepend(entry);
}

async function loadList() {
    const listDiv = document.getElementById('list');

    try {
        const res = await fetch('api.php?action=list');
        const data = await res.json();

        if (data.error) {
            listDiv.innerHTML = `<div style="color:#f87171">서버 에러: ${data.error}</div>`;
            return;
        }

        if (!Array.isArray(data) || data.length === 0) {
            listDiv.innerHTML = `<div style="text-align:center; padding:30px; color:#64748b;">진행 중인 작업이 없습니다.</div>`;
            return;
        }

        listDiv.innerHTML = data.map(item => {
            const percent = item.progress || 0;
            const status = item.status; 
            const addedDate = item.added ? new Date(item.added).toLocaleString('ko-KR') : '-';
            const alias = item.alias || '';
            const sizeGB = (item.bytes / 1024 / 1024 / 1024).toFixed(2);
            
            // 삭제 UI 상태
            const isDeleting = deletingIds.has(item.id);
            const btnDisplay = isDeleting ? 'none' : 'block';
            const confirmDisplay = isDeleting ? 'flex' : 'none';

            // 파일 목록 펼침 상태 확인
            const isOpened = openedFiles.has(item.id);
            const fileListHtml = isOpened ? (fileCache[item.id] || '<div style="padding:10px;">로딩 중...</div>') : '';
            const fileListDisplay = isOpened ? 'block' : 'none';

            let statusBadge = `<span style="color:#94a3b8">대기중</span>`;
            let barColor = 'linear-gradient(90deg, #64748b, #94a3b8)';
            
            if (status === 'downloading') {
                statusBadge = `<span style="color:#a855f7">다운로드 중... ${item.speed ? (item.speed/1024/1024).toFixed(1)+' MB/s' : ''}</span>`;
                barColor = 'linear-gradient(90deg, #8b5cf6, #d946ef)';
            } else if (status === 'downloaded') {
                statusBadge = `<span style="color:#10b981">완료됨</span>`;
                barColor = '#10b981';
            }

            // 완료된 경우 RD 링크 버튼 생성
            let linksHtml = '';
            if (status === 'downloaded' && item.links && item.links.length > 0) {
                linksHtml = `
                    <div class="link-box">
                        ${item.links.map((link, idx) => `
                            <a href="${link}" target="_blank" class="dn-btn">🔗 RD 링크 바로가기 (${idx+1})</a>
                        `).join('')}
                    </div>
                `;
            }

            return `
                <div class="card" id="card-${item.id}">
                    <div class="card-top">
                        <div class="info-group">
                            <div class="file-title" title="${item.filename}">${item.filename}</div>
                            <div class="sub-info">시작일: ${addedDate} | 용량: ${sizeGB} GB</div>
                        </div>
                        <div class="action-group">
                            <div class="alias-wrap">
                                <input type="text" id="alias-${item.id}" value="${alias}" placeholder="별명 입력">
                                <button onclick="saveAlias('${item.id}')">저장</button>
                            </div>
                            
                            <div style="width: 130px; display:flex; justify-content:flex-end;">
                                <button class="btn-del" id="btn-del-${item.id}" style="display:${btnDisplay}" onclick="askDel('${item.id}')">삭제</button>
                                <div class="del-confirm-box" id="confirm-${item.id}" style="display:${confirmDisplay}">
                                    <span style="color:#cbd5e1; font-size:0.8rem;">삭제?</span>
                                    <button class="btn-yes" onclick="realDel('${item.id}')">예</button>
                                    <button class="btn-no" onclick="cancelDel('${item.id}')">아니오</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="progress-wrap">
                        <div class="progress-bar" style="width:${percent}%; background:${barColor}"></div>
                    </div>
                    
                    <div class="status-row">
                        ${statusBadge}
                        <div style="display:flex; gap:10px; align-items:center;">
                            <span>${percent}%</span>
                            <button class="btn-files" onclick="toggleFiles('${item.id}')">📂 파일 목록</button>
                        </div>
                    </div>

                    <div id="files-${item.id}" class="file-list-area" style="display:${fileListDisplay}">
                        ${fileListHtml}
                    </div>

                    ${linksHtml}
                </div>
            `;
        }).join('');

    } catch (e) { }
}

// 파일 목록 토글 함수
async function toggleFiles(id) {
    const area = document.getElementById(`files-${id}`);
    
    if (openedFiles.has(id)) {
        // 이미 열려있으면 닫기
        openedFiles.delete(id);
        area.style.display = 'none';
    } else {
        // 열기
        openedFiles.add(id);
        area.style.display = 'block';

        // 캐시된 데이터가 없으면 로딩 후 API 호출
        if (!fileCache[id]) {
            area.innerHTML = '<div style="padding:15px; color:#94a3b8; text-align:center;">목록 불러오는 중...</div>';
            try {
                const res = await fetch(`api.php?action=info&id=${id}`);
                const data = await res.json();
                
                if (data.files && data.files.length > 0) {
                    const listHtml = data.files.map(f => `
                        <div class="file-item">
                            <span class="fname">${f.path}</span>
                            <span class="fsize">${(f.bytes/1024/1024).toFixed(1)} MB</span>
                        </div>
                    `).join('');
                    fileCache[id] = listHtml; // 캐시 저장
                    area.innerHTML = listHtml;
                } else {
                    fileCache[id] = '<div style="padding:15px;">파일 정보 없음</div>';
                    area.innerHTML = fileCache[id];
                }
            } catch (e) {
                area.innerHTML = '<div style="padding:15px; color:#f87171;">로딩 실패</div>';
            }
        } else {
            // 캐시 있으면 바로 보여줌
            area.innerHTML = fileCache[id];
        }
    }
}

// ... (기존 삭제 및 기타 함수들 동일 유지) ...
function askDel(id) {
    deletingIds.add(id);
    document.getElementById(`btn-del-${id}`).style.display = 'none';
    document.getElementById(`confirm-${id}`).style.display = 'flex';
}
function cancelDel(id) {
    deletingIds.delete(id);
    document.getElementById(`btn-del-${id}`).style.display = 'block';
    document.getElementById(`confirm-${id}`).style.display = 'none';
}
async function realDel(id) {
    deletingIds.delete(id);
    addLog('삭제 요청 중...', 'info');
    const fd = new FormData(); fd.append('rd_id', id);
    try { await fetch('api.php?action=delete', { method:'POST', body:fd }); addLog('삭제 완료', 'success'); loadList(); } 
    catch(e) { addLog(`삭제 실패: ${e.message}`, 'error'); }
}
async function saveAlias(id) {
    const val = document.getElementById(`alias-${id}`).value;
    const fd = new FormData(); fd.append('action', 'updateAlias'); fd.append('rd_id', id); fd.append('alias', val);
    try { await fetch('api.php', { method: 'POST', body: fd }); addLog(`별명 저장 완료`, 'success'); } catch(e) { addLog(`별명 저장 실패`, 'error'); }
}
async function addMag() {
    const mag = document.getElementById('magIn').value;
    if(!mag) return alert('링크를 입력하세요');
    addLog('마그넷 전송 시작...', 'info');
    const fd = new FormData(); fd.append('magnet', mag);
    try { const res = await fetch('api.php?action=addMagnet', { method:'POST', body:fd }); const json = await res.json(); if(json.id) { addLog('마그넷 추가 성공!', 'success'); document.getElementById('magIn').value = ''; loadList(); } else { addLog(`추가 실패: ${json.error}`, 'error'); } } catch(e) { addLog(`전송 오류: ${e.message}`, 'error'); }
}
async function upTor() {
    const input = document.getElementById('torFiles');
    if(input.files.length === 0) return alert('파일을 선택하세요');
    addLog(`토렌트 파일 ${input.files.length}개 업로드 시작`, 'info');
    for(let file of input.files) {
        const fd = new FormData(); fd.append('file', file);
        try { const res = await fetch('api.php?action=uploadTorrent', { method:'POST', body:fd }); const json = await res.json(); if(json.id) addLog(`${file.name} 업로드 성공`, 'success'); else addLog(`${file.name} 실패: ${json.error}`, 'error'); } catch(e) { addLog(`${file.name} 전송 오류`, 'error'); }
    }
    input.value = ''; loadList();
}

setInterval(loadList, 5000);
loadList();
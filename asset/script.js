async function loadList() {
    const listDiv = document.getElementById('list');
    try {
        const res = await fetch('api.php?action=list');
        
        // 500 에러 등의 상황 처리
        if (!res.ok) {
            const text = await res.text();
            listDiv.innerHTML = `<div style="color:#f87171">서버 응답 오류 (HTTP ${res.status}): ${text.substring(0, 50)}...</div>`;
            return;
        }

        const data = await res.json();
        
        if (data.error) {
            listDiv.innerHTML = `<div style="color:#fbbf24">오류 발생: ${data.error}</div>`;
            return;
        }

        if (data.length === 0) {
            listDiv.innerHTML = `<div style="color:#94a3b8">최근 7일간의 히스토리가 없습니다.</div>`;
            return;
        }

        listDiv.innerHTML = data.map(item => {
            const info = item.info;
            return `
                <div class="card">
                    <div class="card-header">
                        <div class="filename">${info.filename}</div>
                        <button class="btn-del" onclick="deleteItem('${item.rd_id}')">삭제</button>
                    </div>
                    
                    <div class="progress-container">
                        <div class="progress-fill" style="width:${info.progress}%"></div>
                    </div>
                    
                    <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:#94a3b8;">
                        <span>상태: ${info.status}</span>
                        <span>진행률: ${info.progress}%</span>
                    </div>

                    ${info.status === 'downloaded' ? `
                        <div style="margin-top:15px; padding:10px; background:#1e293b; border-radius:8px;">
                            ${info.links.map((link, idx) => `<a href="${link}" target="_blank" style="color:#60a5fa; text-decoration:none; display:block; margin-bottom:5px;">📥 다운로드 링크 ${idx+1} 활성화</a>`).join('')}
                        </div>
                    ` : ''}

                    <details>
                        <summary>내부 파일 목록 보기</summary>
                        <div class="file-list">
                            ${info.files ? info.files.map(f => `<div style="padding:4px 0; border-bottom:1px solid #1e293b;">${f.path}</div>`).join('') : '목록 없음'}
                        </div>
                    </details>
                </div>
            `;
        }).join('');

    } catch (e) {
        listDiv.innerHTML = `<div style="color:#ef4444">연결 실패: ${e.message}</div>`;
    }
}

async function addMag() {
    const mag = document.getElementById('magIn').value;
    if(!mag) return;
    const fd = new FormData();
    fd.append('magnet', mag);
    await fetch('api.php?action=addMagnet', { method: 'POST', body: fd });
    document.getElementById('magIn').value = '';
    loadList();
}

async function deleteItem(id) {
    if(!confirm('정말 삭제하시겠습니까?')) return;
    const fd = new FormData();
    fd.append('rd_id', id);
    await fetch('api.php?action=delete', { method: 'POST', body: fd });
    loadList();
}

// 10초마다 상태 갱신
setInterval(loadList, 10000);
loadList();
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const registerForm = document.getElementById('register-form');
    const instancesContainer = document.getElementById('instances-container');
    const btnAddInstanceRow = document.getElementById('btn-add-instance-row');
    const servicesGrid = document.getElementById('services-grid');
    const terminalBody = document.getElementById('terminal-body');
    const autoScrollCheck = document.getElementById('auto-scroll-check');
    const btnClearLogs = document.getElementById('btn-clear-logs');
    
    const btnGenerateToken = document.getElementById('btn-generate-token');
    const tokenDisplayBox = document.getElementById('token-display-box');
    const jwtTokenVal = document.getElementById('jwt-token-val');
    const btnCopyToken = document.getElementById('btn-copy-token');

    // Stats Elements
    const statTotalRequests = document.getElementById('stat-total-requests');
    const statActiveConns = document.getElementById('stat-active-conns');
    const statTotalErrors = document.getElementById('stat-total-errors');
    const statErrorRate = document.getElementById('stat-error-rate');
    const statTotalServices = document.getElementById('stat-total-services');
    const statActiveInstances = document.getElementById('stat-active-instances');

    // State
    let knownLogTimestamps = new Set();
    let isFetchingServices = false;

    // --- Dynamic Instance Row Management ---
    btnAddInstanceRow.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'instance-input-row';
        row.style.marginTop = '8px';
        row.style.display = 'flex';
        row.style.gap = '8px';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'instance-url';
        input.placeholder = 'e.g. http://localhost:8082';
        input.required = true;

        const btnRemove = document.createElement('button');
        btnRemove.type = 'button';
        btnRemove.className = 'btn-secondary';
        btnRemove.style.padding = '10px 14px';
        btnRemove.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        btnRemove.style.color = '#ef4444';
        btnRemove.textContent = '✕';
        btnRemove.addEventListener('click', () => row.remove());

        row.appendChild(input);
        row.appendChild(btnRemove);
        instancesContainer.appendChild(row);
    });

    // --- Create / Register Service ---
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const serviceId = document.getElementById('service-id').value.trim();
        const serviceName = document.getElementById('service-name').value.trim();
        const servicePrefix = document.getElementById('service-prefix').value.trim();
        const serviceHealth = document.getElementById('service-health').value.trim();
        const serviceProtocol = document.getElementById('service-protocol').value;
        const serviceTech = document.getElementById('service-tech').value;
        const serviceLb = document.getElementById('service-lb').value;
        const serviceRateLimit = parseFloat(document.getElementById('service-rate-limit').value) || 0.0;
        const serviceRateBurst = parseInt(document.getElementById('service-rate-burst').value, 10) || 0;
        const serviceAuth = document.getElementById('service-auth').checked;

        // Collect instance URLs
        const inputs = document.querySelectorAll('.instance-url');
        const instances = [];
        inputs.forEach(inp => {
            const val = inp.value.trim();
            if (val) instances.push(val);
        });

        const payload = {
            id: serviceId,
            name: serviceName,
            prefix: servicePrefix,
            protocol: serviceProtocol,
            tech_stack: serviceTech,
            health_check_path: serviceHealth,
            load_balancer_policy: serviceLb,
            instances: instances,
            requires_auth: serviceAuth,
            rate_limit_limit: serviceRateLimit,
            rate_limit_burst: serviceRateBurst
        };

        appendTerminalLine('system', `[CONTROL] Registering service node "${serviceId}" on base routing route "${servicePrefix}"...`);

        try {
            const resp = await fetch('/admin/api/services', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (resp.ok) {
                appendTerminalLine('system', `[CONTROL] Service "${serviceId}" successfully registered & initialized! Active ping queue activated.`);
                registerForm.reset();
                // Reset instances block to a single empty input
                instancesContainer.innerHTML = `
                    <div class="instance-input-row">
                        <input type="text" class="instance-url" placeholder="e.g. http://localhost:8081" required>
                    </div>
                `;
                fetchServices();
            } else {
                const errMsg = await resp.text();
                appendTerminalLine('error', `[ERROR] Failed to register service: ${errMsg}`);
            }
        } catch (err) {
            appendTerminalLine('error', `[ERROR] Network failure contacting gateway controller: ${err.message}`);
        }
    });

    // --- Generate JWT Token ---
    btnGenerateToken.addEventListener('click', async () => {
        try {
            const resp = await fetch('/admin/api/token', { method: 'POST' });
            if (resp.ok) {
                const data = await resp.json();
                jwtTokenVal.value = `Bearer ${data.token}`;
                tokenDisplayBox.classList.remove('hidden');
                appendTerminalLine('system', `[SANDBOX] Secure JWT signed successfully for principal: admin-dashboard-user`);
            } else {
                appendTerminalLine('error', `[ERROR] Sandbox key generator failed.`);
            }
        } catch (err) {
            appendTerminalLine('error', `[ERROR] Network error generating security credential: ${err.message}`);
        }
    });

    // --- Copy Signature ---
    btnCopyToken.addEventListener('click', () => {
        jwtTokenVal.select();
        document.execCommand('copy');
        const originalText = btnCopyToken.textContent;
        btnCopyToken.textContent = 'Signature Copied! ✓';
        btnCopyToken.style.background = 'linear-gradient(135deg, var(--neon-green) 0%, #059669 100%)';
        btnCopyToken.style.boxShadow = '0 4px 14px 0 rgba(16, 185, 129, 0.3)';
        setTimeout(() => {
            btnCopyToken.textContent = originalText;
            btnCopyToken.style.background = '';
            btnCopyToken.style.boxShadow = '';
        }, 1500);
    });

    // --- Delete / Deregister Service ---
    window.deleteService = async (serviceId) => {
        if (!confirm(`Are you sure you want to remove the "${serviceId}" microservice cluster?`)) return;

        appendTerminalLine('system', `[CONTROL] Commencing removal profile for microservice cluster: ${serviceId}...`);

        try {
            const resp = await fetch(`/admin/api/services/${serviceId}`, {
                method: 'DELETE'
            });

            if (resp.ok) {
                appendTerminalLine('system', `[CONTROL] Service "${serviceId}" completely de-provisioned from routing directory. Zero-downtime routing refreshed.`);
                fetchServices();
            } else {
                appendTerminalLine('error', `[ERROR] Failed to deregister "${serviceId}": ${await resp.text()}`);
            }
        } catch (err) {
            appendTerminalLine('error', `[ERROR] Connection error during de-registration: ${err.message}`);
        }
    };

    // --- Fetch Service List ---
    async function fetchServices() {
        if (isFetchingServices) return;
        isFetchingServices = true;

        try {
            const resp = await fetch('/admin/api/services');
            if (!resp.ok) throw new Error(`HTTP status ${resp.status}`);
            
            const services = await resp.json();
            renderServices(services);
        } catch (err) {
            console.error('Error loading services:', err);
        } finally {
            isFetchingServices = false;
        }
    }

    function renderServices(services) {
        statTotalServices.textContent = services.length;
        
        if (services.length === 0) {
            servicesGrid.innerHTML = `
                <div class="loading-state">
                    No microservices registered yet.
                    <br><span style="font-size:11px; margin-top:8px; display:inline-block; color:var(--text-secondary);">Fill out the panel on the left to deploy dynamically!</span>
                </div>
            `;
            statActiveInstances.textContent = '0 Nodes Active';
            return;
        }

        let totalNodes = 0;
        let activeNodes = 0;
        let gridHTML = '';

        services.sort((a, b) => a.id.localeCompare(b.id)).forEach(svc => {
            const instances = svc.instances || [];
            totalNodes += instances.length;
            
            let instanceRowsHTML = '';
            instances.forEach(inst => {
                if (inst.healthy) activeNodes++;
                const statusDot = inst.healthy ? 'green' : 'red';
                const latency = inst.healthy ? formatDuration(inst.latency) : 'offline';
                const activeConns = inst.active_connections || 0;

                instanceRowsHTML += `
                    <div class="instance-card-row">
                        <div class="instance-left">
                            <span class="pulse-dot ${statusDot}"></span>
                            <span>${truncateURL(inst.url)}</span>
                        </div>
                        <div class="instance-right">
                            <span class="latency-badge">${latency}</span>
                            <span class="active-conns-count">${activeConns} conn</span>
                        </div>
                    </div>
                `;
            });

            // Get standard badges
            const protoClass = `badge-${svc.protocol.toLowerCase()}`;
            const techClass = getTechBadgeClass(svc.tech_stack);

            gridHTML += `
                <div class="service-card glass">
                    <div class="card-top">
                        <div class="service-title-wrapper">
                            <span class="service-name-text">${escapeHTML(svc.name)}</span>
                            <span class="service-id-text">${escapeHTML(svc.id)}</span>
                        </div>
                        <div class="badges-row">
                            <span class="badge ${protoClass}">${escapeHTML(svc.protocol)}</span>
                            <span class="badge ${techClass}">${escapeHTML(svc.tech_stack)}</span>
                        </div>
                    </div>

                    <div class="card-metadata">
                        <div class="meta-item">
                            <span class="meta-label">Route Base:</span>
                            <span class="meta-val" style="font-family:'Fira Code',monospace; color:var(--neon-cyan);">${escapeHTML(svc.prefix)}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Load Balancer:</span>
                            <span class="meta-val">${escapeHTML(svc.load_balancer_policy)}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Rate Limit:</span>
                            <span class="meta-val" style="color: ${svc.rate_limit_limit > 0 ? 'var(--neon-cyan)' : 'inherit'}">${svc.rate_limit_limit > 0 ? `${svc.rate_limit_limit} rps (burst ${svc.rate_limit_burst})` : 'Disabled'}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Security:</span>
                            <span class="meta-val" style="color: ${svc.requires_auth ? 'var(--neon-yellow)' : '#fff'}">${svc.requires_auth ? '🔐 JWT Enforced' : '🔓 Public'}</span>
                        </div>
                    </div>

                    <div class="card-instances-title">Nodes Cluster (${instances.length})</div>
                    <div class="card-instances-list">
                        ${instanceRowsHTML || '<div style="font-size:11px; font-style:italic; color:var(--text-secondary);">No nodes configured</div>'}
                    </div>

                    <button onclick="deleteService('${escapeHTML(svc.id)}')" class="btn-card-delete">Deregister Service</button>
                </div>
            `;
        });

        servicesGrid.innerHTML = gridHTML;
        statActiveInstances.textContent = `${activeNodes} / ${totalNodes} Nodes Healthy`;
    }

    // --- Fetch Realtime Stats ---
    async function fetchStats() {
        try {
            const resp = await fetch('/admin/api/stats');
            if (!resp.ok) return;

            const stats = await resp.json();
            
            statTotalRequests.textContent = stats.total_requests.toLocaleString();
            statActiveConns.textContent = stats.active_connections.toLocaleString();
            statTotalErrors.textContent = stats.total_errors.toLocaleString();

            if (stats.total_requests > 0) {
                const rate = (stats.total_errors / stats.total_requests) * 100;
                statErrorRate.textContent = `${rate.toFixed(2)}% Error Rate`;
                if (rate > 5) {
                    statErrorRate.className = 'stats-indicator text-red';
                } else if (rate > 1) {
                    statErrorRate.className = 'stats-indicator text-yellow';
                } else {
                    statErrorRate.className = 'stats-indicator text-green';
                }
            } else {
                statErrorRate.textContent = '0.0% Error Rate';
                statErrorRate.className = 'stats-indicator text-green';
            }
        } catch (err) {
            console.error('Stats network error:', err);
        }
    }

    // --- Fetch and Stream Logs ---
    async function fetchLogs() {
        try {
            const resp = await fetch('/admin/api/logs');
            if (!resp.ok) return;

            const logs = await resp.json();
            let newLogAdded = false;

            logs.forEach(log => {
                // Construct a unique key to prevent duplicate line prints
                const key = `${log.timestamp}-${log.ip}-${log.method}-${log.path}-${log.status}`;
                if (!knownLogTimestamps.has(key)) {
                    knownLogTimestamps.add(key);
                    appendTransactionLog(log);
                    newLogAdded = true;
                }
            });

            // Prevent set from memory leakage by keeping last 200 keys
            if (knownLogTimestamps.size > 200) {
                const arr = Array.from(knownLogTimestamps);
                knownLogTimestamps = new Set(arr.slice(arr.length - 150));
            }

            if (newLogAdded && autoScrollCheck.checked) {
                terminalBody.scrollTop = terminalBody.scrollHeight;
            }
        } catch (err) {
            console.error('Logs fetch error:', err);
        }
    }

    function appendTransactionLog(log) {
        const line = document.createElement('div');
        line.className = 'terminal-line';
        line.style.padding = '8px 12px';
        line.style.borderBottom = '1px solid rgba(255, 255, 255, 0.04)';
        line.style.display = 'flex';
        line.style.alignItems = 'center';
        line.style.gap = '10px';
        line.style.flexWrap = 'wrap';

        const timeStr = formatTime(new Date(log.timestamp));
        
        // Method badge colors
        let methodColor = 'var(--neon-cyan)';
        let methodBg = 'rgba(8, 145, 178, 0.15)';
        if (log.method === 'POST') {
            methodColor = '#10b981'; // Green
            methodBg = 'rgba(16, 185, 129, 0.15)';
        } else if (log.method === 'DELETE') {
            methodColor = '#ef4444'; // Red
            methodBg = 'rgba(239, 68, 68, 0.15)';
        } else if (log.method === 'PUT' || log.method === 'PATCH') {
            methodColor = '#f59e0b'; // Amber
            methodBg = 'rgba(245, 158, 11, 0.15)';
        }

        // Status badge styling
        let statusColor = '#10b981'; // 2xx Green
        let statusBg = 'rgba(16, 185, 129, 0.15)';
        let statusText = `${log.status} OK`;
        let statusIcon = '✓';
        let extraTag = '<span style="color: #10b981; font-weight: 500; font-size: 11px; margin-left: auto;">[Routed ➜ Forwarded]</span>';

        if (log.status >= 300 && log.status < 400) {
            statusColor = '#3b82f6'; // Blue
            statusBg = 'rgba(59, 130, 246, 0.15)';
            statusText = `${log.status} REDIRECT`;
            statusIcon = '➜';
        } else if (log.status >= 400 && log.status < 500) {
            statusColor = '#f59e0b'; // Amber
            statusBg = 'rgba(245, 158, 11, 0.15)';
            statusIcon = '⚠';
            if (log.status === 401) {
                statusText = '401 UNAUTHORIZED';
                extraTag = '<span style="color: #ef4444; font-weight: 600; font-size: 11px; text-shadow: 0 0 8px rgba(239, 68, 68, 0.3); margin-left: auto;">🛑 [BLOCKED: MISSING AUTH]</span>';
            } else if (log.status === 429) {
                statusText = '429 TOO MANY REQS';
                extraTag = '<span style="color: #f59e0b; font-weight: 600; font-size: 11px; text-shadow: 0 0 8px rgba(245, 158, 11, 0.3); margin-left: auto;">⚡ [BLOCKED: RATE LIMITED]</span>';
            } else if (log.status === 404) {
                statusText = '404 NOT FOUND';
                extraTag = '<span style="color: #f59e0b; font-weight: 500; font-size: 11px; margin-left: auto;">✕ [ROUTE UNMATCHED]</span>';
            } else {
                statusText = `${log.status} CLIENT ERROR`;
            }
        } else if (log.status >= 500) {
            statusColor = '#ef4444'; // Red
            statusBg = 'rgba(239, 68, 68, 0.2)';
            statusText = `${log.status} GATEWAY FAIL`;
            statusIcon = '🔥';
            extraTag = '<span style="color: #ef4444; font-weight: 600; font-size: 11px; margin-left: auto;">🔥 [FORWARDING FAILED]</span>';
        }

        // Parse latency to highlight slow requests
        let latencyColor = '#10b981'; // Green
        if (log.latency.includes('s') && !log.latency.includes('ms')) {
            latencyColor = '#ef4444'; // slow > 1s
        } else {
            const val = parseFloat(log.latency);
            if (!isNaN(val) && val > 250.0) {
                latencyColor = '#f59e0b'; // medium slow > 250ms
            }
        }

        line.innerHTML = `
            <span style="color: #64748b; font-family: monospace; font-size: 11px;">[${timeStr}]</span>
            <span style="color: #94a3b8; font-size: 12px; font-weight: 500;">${escapeHTML(log.ip)}</span>
            <span style="color: ${methodColor}; background: ${methodBg}; padding: 2px 8px; border-radius: 4px; font-family: 'Fira Code', monospace; font-weight: 600; font-size: 11px; min-width: 50px; text-align: center;">${escapeHTML(log.method)}</span>
            <span style="color: #f1f5f9; font-family: 'Fira Code', monospace; font-size: 12px;">${escapeHTML(log.path)}</span>
            <span style="color: #64748b; font-size: 12px; font-weight: 500;">➜</span>
            <span style="color: ${statusColor}; background: ${statusBg}; padding: 2px 8px; border-radius: 4px; font-family: 'Fira Code', monospace; font-weight: 600; font-size: 11px; display: flex; align-items: center; gap: 4px;">
                <span>${statusIcon}</span> <span>${statusText}</span>
            </span>
            <span style="color: ${latencyColor}; font-size: 11px; font-weight: 600;">(${log.latency})</span>
            ${extraTag}
        `;

        terminalBody.appendChild(line);

        // Limit DOM size to last 100 lines for performance
        while (terminalBody.childElementCount > 100) {
            terminalBody.removeChild(terminalBody.firstChild);
        }
    }

    function appendTerminalLine(type, text) {
        const line = document.createElement('div');
        line.className = `terminal-line ${type}-line`;
        line.innerHTML = `
            <span class="log-timestamp">[${formatTime(new Date())}]</span>
            <span>${escapeHTML(text)}</span>
        `;
        terminalBody.appendChild(line);
        if (autoScrollCheck.checked) {
            terminalBody.scrollTop = terminalBody.scrollHeight;
        }
    }

    btnClearLogs.addEventListener('click', () => {
        terminalBody.innerHTML = '';
        appendTerminalLine('system', '[SYSTEM] Console logging buffer cleared.');
    });

    // --- Helper Utilities ---
    function formatTime(date) {
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        const s = String(date.getSeconds()).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    function truncateURL(url) {
        return url.replace(/^https?:\/\//, '');
    }

    function formatDuration(ns) {
        // Nano to millisecond
        const ms = ns / 1000000;
        if (ms < 1) {
            return `${(ns / 1000).toFixed(1)}µs`;
        }
        return `${ms.toFixed(1)}ms`;
    }

    function getTechBadgeClass(tech) {
        switch (tech) {
            case 'Go': return 'badge-go';
            case 'Spring Boot': return 'badge-spring';
            case 'Node.js': return 'badge-node';
            default: return 'badge-generic';
        }
    }

    function getMethodClass(method) {
        switch (method.toUpperCase()) {
            case 'GET': return 'method-get';
            case 'POST': return 'method-post';
            case 'DELETE': return 'method-delete';
            default: return 'method-other';
        }
    }

    function getStatusClass(status) {
        const code = Math.floor(status / 100);
        switch (code) {
            case 2: return 'status-2xx';
            case 3: return 'status-3xx';
            case 4: return 'status-4xx';
            case 5: return 'status-5xx';
            default: return '';
        }
    }

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }
    // --- Orchestrate Polling with Session Verification ---
    let servicesInterval = null;
    let statsInterval = null;
    let logsInterval = null;

    function startDashboardLoops() {
        stopDashboardLoops();
        fetchServices();
        fetchStats();
        fetchLogs();

        servicesInterval = setInterval(fetchServices, 2000);
        statsInterval = setInterval(fetchStats, 1500);
        logsInterval = setInterval(fetchLogs, 1000);
    }

    function stopDashboardLoops() {
        if (servicesInterval) clearInterval(servicesInterval);
        if (statsInterval) clearInterval(statsInterval);
        if (logsInterval) clearInterval(logsInterval);
    }

    // --- Theme Toggle ---
    const themeToggle = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('ts_theme') || 'light';
    
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }

    themeToggle.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('light-theme');
        localStorage.setItem('ts_theme', isLight ? 'light' : 'dark');
    });

    // --- Admin Authentication Handlers ---
    const loginScreen = document.getElementById('login-screen');
    const dashboardScreen = document.getElementById('dashboard-screen');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const btnLogoutHeader = document.getElementById('btn-logout-header');

    function checkSession() {
        const token = localStorage.getItem('ts_session_token');
        if (token) {
            // Logged in
            loginScreen.classList.add('hidden');
            dashboardScreen.classList.remove('hidden');
            btnLogoutHeader.classList.remove('hidden');
            startDashboardLoops();
        } else {
            // Logged out
            stopDashboardLoops();
            dashboardScreen.classList.add('hidden');
            btnLogoutHeader.classList.add('hidden');
            loginScreen.classList.remove('hidden');
        }
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.classList.add('hidden');

        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        appendTerminalLine('system', `[AUTH] Authenticating administrator "${username}"...`);

        try {
            const resp = await fetch('/admin/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await resp.json();

            if (resp.ok && data.status === 'success') {
                localStorage.setItem('ts_session_token', data.token);
                appendTerminalLine('system', `[AUTH] Authentication success. Session established.`);
                checkSession();
            } else {
                loginError.classList.remove('hidden');
                loginError.textContent = data.message || 'Invalid admin username or password.';
                appendTerminalLine('system', `[AUTH] Authentication failed for "${username}".`);
            }
        } catch (err) {
            loginError.classList.remove('hidden');
            loginError.textContent = 'Server connection failed. Could not reach Control Plane API.';
            appendTerminalLine('system', `[AUTH] Server connection failed during authentication.`);
        }
    });

    btnLogoutHeader.addEventListener('click', () => {
        appendTerminalLine('system', `[AUTH] Administrative session terminated by user.`);
        localStorage.removeItem('ts_session_token');
        checkSession();
    });

    // Run session check on load
    checkSession();
});

let allMembers = [];
let weeklyMembers = [];
let monthMembers = [];
let activePeriod = 'all';
let sortKey = 'distance';
let monthlyChart = null;
let memberChart = null;
let allMonthlyChart = null;

async function init() {
  const res = await fetch('/api/me');
  const data = await res.json();

  if (data.loggedIn) {
    document.getElementById('login-btn').classList.add('hidden');
    document.getElementById('user-info').classList.remove('hidden');
    document.getElementById('user-avatar').src = data.athlete.profile_medium;
    document.getElementById('user-name').textContent = `${data.athlete.firstname} ${data.athlete.lastname}`;
    showDashboard();
  } else {
    document.getElementById('landing').classList.remove('hidden');
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('error')) showError('Đăng nhập thất bại. Vui lòng thử lại.');
}

function showDashboard() {
  document.getElementById('dashboard').classList.remove('hidden');
  loadStats();
}

async function syncStrava() {
  const btn = document.getElementById('sync-btn');
  btn.disabled = true;
  btn.textContent = 'Đang sync…';
  clearError();
  try {
    const clubIdInput = document.getElementById('club-id-input').value.trim();
    const res = await fetch('/api/club/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clubIdInput ? { club_id: clubIdInput } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sync thất bại');
    await loadStats();
  } catch (err) {
    showError(`Lỗi sync: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg> Sync Strava`;
  }
}

async function loadStats() {
  setLoading(true);
  clearError();
  const clubIdInput = document.getElementById('club-id-input').value.trim();
  const url = clubIdInput ? `/api/club/stats?club_id=${clubIdInput}` : '/api/club/stats';
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Không thể tải dữ liệu');
    }
    renderDashboard(await res.json());
  } catch (err) {
    showError(`Lỗi: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

function renderDashboard({ club, summary, members, weekly, thisMonth, monthly, lastSync, recentActivities }) {
  document.getElementById('club-name').textContent = club.name || 'Running Club';
  const loc = [club.city, club.country].filter(Boolean).join(', ');
  document.getElementById('club-location').textContent = loc;
  document.getElementById('last-sync').textContent = lastSync
    ? `Cập nhật lần cuối: ${new Date(lastSync).toLocaleString('vi-VN')}`
    : 'Chưa sync lần nào';

  document.getElementById('total-distance').textContent = fmt(summary.totalDistance / 1000, 1) + ' km';
  document.getElementById('total-elevation').textContent = fmt(summary.totalElevation) + ' m';
  document.getElementById('total-runs').textContent = summary.totalRuns.toLocaleString();
  document.getElementById('total-members').textContent = summary.totalMembers;

  allMembers = members;
  weeklyMembers = weekly || [];
  monthMembers = thisMonth || [];

  switchPeriod(activePeriod, monthly);
  renderMonthlyChart(monthly);
  renderMemberChart(members);
  renderRecentActivities(recentActivities || []);
}

function switchPeriod(period, monthly) {
  activePeriod = period;
  const label = document.getElementById('period-label');
  const chartWrap = document.getElementById('all-chart-wrap');
  const tableWrap = document.getElementById('leaderboard-wrap');
  const sortTabs = document.getElementById('sort-tabs');

  document.querySelectorAll('.period-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.period === period)
  );

  if (period === 'all') {
    label.classList.add('hidden');
    chartWrap.classList.remove('hidden');
    tableWrap.classList.add('hidden');
    sortTabs.classList.add('hidden');
    renderAllMonthlyChart(monthly || window._cachedMonthly);
  } else {
    chartWrap.classList.add('hidden');
    tableWrap.classList.remove('hidden');
    sortTabs.classList.remove('hidden');

    if (period === 'week') {
      const mon = getMondayLabel();
      label.textContent = `Từ thứ Hai ${mon} đến nay`;
      label.classList.remove('hidden');
      renderLeaderboard(weeklyMembers);
    } else if (period === 'month') {
      const now = new Date();
      const monthName = now.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
      label.textContent = `Tháng ${monthName}`;
      label.classList.remove('hidden');
      renderLeaderboard(monthMembers);
    }
  }
}

function renderLeaderboard(members) {
  const sorted = [...members].sort((a, b) => b[sortKey] - a[sortKey]);
  const maxVal = sorted[0]?.[sortKey] || 1;
  const tbody = document.getElementById('leaderboard-body');
  tbody.innerHTML = sorted.map((m, i) => {
    const pct = (m[sortKey] / maxVal * 100).toFixed(1);
    return `<tr>
      <td><span class="rank-badge rank-${i + 1}">${i + 1}</span></td>
      <td><strong>${m.name}</strong></td>
      <td>${m.runs}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <span>${fmt(m.distance / 1000, 1)} km</span>
          <div class="progress-bar-wrap">
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
          </div>
        </div>
      </td>
      <td>${fmt(m.elevation)} m</td>
      <td>${fmt(m.longest_run / 1000, 1)} km</td>
      <td>${fmtTime(m.moving_time)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px">Chưa có dữ liệu</td></tr>';
}

function renderAllMonthlyChart(monthly) {
  if (!monthly) return;
  window._cachedMonthly = monthly;
  const labels = Object.keys(monthly).sort();
  const distances = labels.map(k => +(monthly[k].distance / 1000).toFixed(1));

  if (allMonthlyChart) allMonthlyChart.destroy();
  const ctx = document.getElementById('all-monthly-chart').getContext('2d');
  allMonthlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(l => {
        const [y, m] = l.split('-');
        return new Date(y, m - 1).toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' });
      }),
      datasets: [{
        label: 'Tổng km',
        data: distances,
        backgroundColor: '#fc4c02cc',
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} km` } },
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v + ' km' } },
        x: { grid: { display: false } },
      },
    },
  });
}

function renderMonthlyChart(monthly) {
  const labels = Object.keys(monthly).sort();
  const distances = labels.map(k => +(monthly[k].distance / 1000).toFixed(1));
  if (monthlyChart) monthlyChart.destroy();
  const ctx = document.getElementById('monthly-chart').getContext('2d');
  monthlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(l => {
        const [y, m] = l.split('-');
        return new Date(y, m - 1).toLocaleDateString('vi-VN', { month: 'short', year: '2-digit' });
      }),
      datasets: [{ label: 'Km', data: distances, backgroundColor: '#fc4c02cc', borderRadius: 6 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v + ' km' } },
        x: { grid: { display: false } },
      },
    },
  });
}

function renderMemberChart(members) {
  const top = [...members].sort((a, b) => b.distance - a.distance).slice(0, 8);
  if (memberChart) memberChart.destroy();
  const ctx = document.getElementById('member-chart').getContext('2d');
  memberChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(m => m.name.split(' ').slice(-1)[0]),
      datasets: [{
        label: 'km',
        data: top.map(m => +(m.distance / 1000).toFixed(1)),
        backgroundColor: ['#fc4c02','#3b82f6','#22c55e','#a855f7','#f59e0b','#06b6d4','#ec4899','#84cc16'],
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { callback: v => v + ' km' } },
        y: { grid: { display: false } },
      },
    },
  });
}

function renderRecentActivities(activities) {
  document.getElementById('activities-count').textContent = `${activities.length} buổi gần nhất`;
  const tbody = document.getElementById('activities-body');
  tbody.innerHTML = activities.map(a => {
    const dt = new Date(a.start_date);
    const dateStr = dt.toLocaleDateString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const timeStr = dt.toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit',
    });
    return `<tr>
      <td><span class="date-str">${dateStr}</span><span class="time-str">${timeStr}</span></td>
      <td><strong>${a.name}</strong></td>
      <td>${fmt(a.distance / 1000, 2)} km</td>
      <td>${fmt(a.total_elevation_gain)} m</td>
      <td>${fmtTime(a.moving_time)}</td>
    </tr>`;
  }).join('');
}

// Period tabs
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => switchPeriod(btn.dataset.period, window._cachedMonthly));
});

// Sort tabs
document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    sortKey = btn.dataset.sort;
    const data = activePeriod === 'week' ? weeklyMembers : monthMembers;
    renderLeaderboard(data);
  });
});

function getMondayLabel() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  return mon.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmt(n, decimals = 0) {
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: decimals });
}

function fmtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function setLoading(on) {
  document.getElementById('loading').classList.toggle('hidden', !on);
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearError() {
  document.getElementById('error-msg').classList.add('hidden');
}

init();

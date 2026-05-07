const API = {
  health: "/api/health",
  template: "/api/template",
  upload: "/api/uploads/base-table",
  versions: "/api/versions",
  version: (id) => `/api/versions/${encodeURIComponent(id)}`,
  dashboard: (id, basis) => `/api/dashboard${id ? `?version_id=${encodeURIComponent(id)}&cost_basis=${basis}` : `?cost_basis=${basis}`}`,
  confirm: (id) => `/api/versions/${encodeURIComponent(id)}/confirm`,
  recalculate: (id) => `/api/versions/${encodeURIComponent(id)}/recalculate`,
  deleteVersion: (id) => `/api/versions/${encodeURIComponent(id)}`,
  diffs: (id) => `/api/versions/${encodeURIComponent(id)}/diffs`,
  diff: (id) => `/api/diffs/${encodeURIComponent(id)}`,
  export: (id, basis) => `/api/versions/${encodeURIComponent(id)}/export?cost_basis=${basis}`,
};

const state = {
  view: "dashboard",
  versions: [],
  selectedVersionId: "",
  costBasis: "tax_included",
  dashboard: null,
  detail: null,
  detailMaterialSearch: "",
  detailPage: 1,
  detailPageSize: 10,
  diffs: [],
  notice: "",
  error: "",
  uploadResult: null,
};

const app = document.querySelector("#app");

function h(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function unwrap(payload) {
  return payload && payload.success ? payload.data : payload;
}

function money(value) {
  return Number(value || 0).toLocaleString("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(value) {
  if (value === null || value === undefined) return "-";
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function statusPill(status) {
  const cls = status === "CONFIRMED" ? "ok" : status === "NEEDS_PRICE" ? "bad" : "warn";
  const label = { CONFIRMED: "已确认", NEEDS_PRICE: "待补价", CALCULATED: "已核算", PARSED: "已解析" }[status] || status;
  return `<span class="pill ${cls}">${h(label)}</span>`;
}

async function api(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { detail: text };
  }
  if (!res.ok) {
    throw new Error(payload.detail || payload.message || "请求失败");
  }
  return unwrap(payload);
}

async function refresh() {
  try {
    state.versions = await api(API.versions);
    if (state.selectedVersionId && !state.versions.some((version) => version.version_id === state.selectedVersionId)) {
      state.selectedVersionId = "";
    }
    if (!state.selectedVersionId && state.versions.length) {
      state.selectedVersionId = state.versions[0].version_id;
    }
    state.dashboard = await api(API.dashboard(state.selectedVersionId, state.costBasis));
    if (state.selectedVersionId) {
      state.detail = await api(API.version(state.selectedVersionId));
      state.diffs = await api(API.diffs(state.selectedVersionId));
    } else {
      state.detail = null;
      state.diffs = [];
    }
    state.error = "";
  } catch (err) {
    state.error = err.message;
  }
  render();
}

function shell(content) {
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">BOM-v3<br/>产品成本管控</div>
        <nav class="nav">
          ${navButton("dashboard", "成本看板")}
          ${navButton("upload", "底表上传")}
          ${navButton("versions", "版本管理")}
          ${navButton("diffs", "版本对比")}
          ${navButton("rules", "规则口径")}
        </nav>
      </aside>
      <main class="main">
        ${state.notice ? `<div class="notice">${h(state.notice)}</div>` : ""}
        ${state.error ? `<div class="notice error">${h(state.error)}</div>` : ""}
        ${content}
      </main>
    </div>
  `;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.notice = "";
      state.error = "";
      render();
    });
  });
}

function navButton(view, label) {
  return `<button class="${state.view === view ? "active" : ""}" data-view="${view}">${label}</button>`;
}

function header(title, subtitle) {
  return `
    <div class="topbar">
      <div>
        <h1>${h(title)}</h1>
        <div class="subtitle">${h(subtitle)}</div>
      </div>
      <div class="row">
        <select id="globalVersion">
          <option value="">最新版本</option>
          ${state.versions.map((v) => `<option value="${h(v.version_id)}" ${v.version_id === state.selectedVersionId ? "selected" : ""}>${h(v.sku)} / ${h(v.version_name)}</option>`).join("")}
        </select>
        <select id="globalBasis">
          <option value="tax_included" ${state.costBasis === "tax_included" ? "selected" : ""}>含税</option>
          <option value="tax_excluded" ${state.costBasis === "tax_excluded" ? "selected" : ""}>不含税</option>
        </select>
      </div>
    </div>
  `;
}

function bindHeaderControls() {
  const version = document.querySelector("#globalVersion");
  const basis = document.querySelector("#globalBasis");
  if (version) {
    version.addEventListener("change", async () => {
      state.selectedVersionId = version.value;
      state.detailMaterialSearch = "";
      state.detailPage = 1;
      await refresh();
    });
  }
  if (basis) {
    basis.addEventListener("change", async () => {
      state.costBasis = basis.value;
      await refresh();
    });
  }
}

function render() {
  if (state.view === "upload") return renderUpload();
  if (state.view === "versions") return renderVersions();
  if (state.view === "diffs") return renderDiffs();
  if (state.view === "rules") return renderRules();
  return renderDashboard();
}

function renderDashboard() {
  const data = state.dashboard || { kpis: {}, stage_summary: [], risks: [], trend: [], diffs: [] };
  const k = data.kpis || {};
  shell(`
    ${header("产品成本看板", "展示产品总成本、工段结构、版本趋势、缺价风险和差异明细")}
    <section class="grid cols-4">
      ${kpi("产品总成本", money(k.total_cost))}
      ${kpi("较上一版本差异", money(k.diff_amount))}
      ${kpi("差异比例", pct(k.diff_ratio))}
      ${kpi("缺失价格物料数", k.missing_price_count ?? 0)}
      ${kpi("最大成本工段", k.max_cost_stage || "-")}
      ${kpi("最大上涨工段", k.max_increase_stage || "-")}
      ${kpi("成本口径", state.costBasis === "tax_excluded" ? "不含税" : "含税")}
      ${kpi("版本状态", data.version ? statusText(data.version.status) : "-")}
    </section>
    <section class="panel">
      <div class="toolbar">
        <strong>工段成本汇总</strong>
        ${data.version ? `<a href="${API.export(data.version.version_id, state.costBasis)}"><button class="secondary">导出 Excel</button></a>` : ""}
      </div>
      ${stageTable(data.stage_summary || [])}
    </section>
    <section class="panel">
      <div class="toolbar"><strong>缺价风险明细</strong><span class="muted">允许底表先入库，但阻断成本版本确认/发布</span></div>
      ${riskTable(data.risks || [])}
    </section>
    <section class="grid cols-2">
      <div class="panel">
        <strong>成本趋势</strong>
        ${trendList(data.trend || [])}
      </div>
      <div class="panel">
        <strong>版本差异 Top 20</strong>
        ${diffTable(data.diffs || [], false)}
      </div>
    </section>
  `);
  bindHeaderControls();
}

function kpi(label, value) {
  return `<div class="card"><div class="label">${h(label)}</div><div class="value">${h(value)}</div></div>`;
}

function statusText(status) {
  return { CONFIRMED: "已确认", NEEDS_PRICE: "待补价", CALCULATED: "已核算" }[status] || status || "-";
}

function stageTable(rows) {
  if (!rows.length) return `<div class="muted">暂无工段数据，请先上传底表。</div>`;
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>工段</th><th>成本</th><th>占比</th><th>缺价数</th><th>占比条</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr>
          <td>${h(row.stage)}</td>
          <td>${money(row.cost)}</td>
          <td>${pct(row.ratio)}</td>
          <td>${h(row.missing_price_count)}</td>
          <td><div class="bar"><span style="width:${Math.min(Number(row.ratio || 0) * 100, 100)}%"></span></div></td>
        </tr>`).join("")}</tbody>
    </table></div>
  `;
}

function riskTable(rows) {
  if (!rows.length) return `<div class="muted">当前版本没有缺价风险。</div>`;
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>SKU</th><th>行号</th><th>物料编码</th><th>物料名称</th><th>所属工段</th><th>缺失字段</th><th>状态</th><th>影响</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td>${h(r.sku)}</td><td>${h(r.row_no)}</td><td>${h(r.material_code)}</td><td>${h(r.material_name)}</td>
          <td>${h(r.stage)}</td><td>${h(r.missing_field)}</td><td><span class="pill bad">${h(r.status)}</span></td><td>${h(r.impact)}</td>
        </tr>`).join("")}</tbody>
    </table></div>
  `;
}

function trendList(rows) {
  if (!rows.length) return `<div class="muted">暂无版本趋势。</div>`;
  const max = Math.max(...rows.map((r) => Number(r.cost || 0)), 1);
  return rows.map((r) => `
    <div style="margin-top:12px">
      <div class="row" style="justify-content:space-between"><span>${h(r.version_name)}</span><strong>${money(r.cost)}</strong></div>
      <div class="bar"><span style="width:${Math.round(Number(r.cost || 0) / max * 100)}%"></span></div>
    </div>
  `).join("");
}

function renderUpload() {
  shell(`
    ${header("底表上传", "一张底表解析 BOM、采购价格、税率、委外加工费，并生成可复算成本版本")}
    <section class="panel">
      <form id="uploadForm" class="grid">
        <div class="form-grid">
          <div class="field"><label>SKU，可留空由底表识别</label><input name="sku" placeholder="SKU-001" /></div>
          <div class="field"><label>成本版本名称</label><input name="version_name" placeholder="V2026.05.08" /></div>
          <div class="field"><label>上传人</label><input name="uploader" value="system" /></div>
          <div class="field"><label>底表文件</label><input type="file" name="file" accept=".xlsx,.xlsm" required /></div>
        </div>
        <div class="row">
          <button type="submit">上传并解析入库</button>
          <a href="${API.template}"><button type="button" class="secondary">下载模板</button></a>
        </div>
      </form>
    </section>
    ${uploadResult()}
  `);
  bindHeaderControls();
  document.querySelector("#uploadForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = new FormData(form);
    state.notice = "正在上传并解析底表...";
    state.error = "";
    render();
    try {
      state.uploadResult = await api(API.upload, { method: "POST", body: payload });
      state.notice = state.uploadResult.persisted ? "底表已入库并生成成本版本。" : "底表校验未通过，请处理阻断项。";
      await refresh();
      state.view = "upload";
      render();
    } catch (err) {
      state.error = err.message;
      render();
    }
  });
}

function uploadResult() {
  const result = state.uploadResult;
  if (!result) return "";
  const summary = result.summary || {};
  return `
    <section class="panel">
      <div class="toolbar"><strong>上传结果</strong>${result.version ? statusPill(result.version.status) : ""}</div>
      <div class="grid cols-4">
        ${kpi("SKU", summary.sku || result.version?.sku || "-")}
        ${kpi("行数", summary.row_count ?? "-")}
        ${kpi("末级数", summary.leaf_count ?? "-")}
        ${kpi("缺价数", summary.missing_price_count ?? result.version?.missing_price_count ?? "-")}
      </div>
      ${issuesTable("阻断错误", result.errors || [])}
      ${issuesTable("警告/提示", result.warnings || [])}
    </section>
  `;
}

function issuesTable(title, rows) {
  if (!rows.length) return "";
  return `
    <h3>${h(title)}</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>级别</th><th>行号</th><th>字段</th><th>问题</th><th>建议</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${h(r.level)}</td><td>${h(r.row_no)}</td><td>${h(r.field)}</td><td>${h(r.problem || r.message)}</td><td>${h(r.suggestion || "")}</td></tr>`).join("")}</tbody>
    </table></div>
  `;
}

function renderVersions() {
  shell(`
    ${header("版本管理", "查看上传批次生成的成本版本，缺价版本不能确认/发布")}
    <section class="panel">${versionTable()}</section>
    <section class="panel">
      <div class="toolbar">
        <strong>成本明细</strong>
        <div class="detail-controls">
          <label class="search-control">
            <span>物料编码</span>
            <input id="detailMaterialSearch" value="${h(state.detailMaterialSearch)}" placeholder="输入物料编码搜索" />
          </label>
          <button class="secondary compact" id="detailSearchButton">搜索</button>
          <button class="secondary compact" id="detailClearButton">清空</button>
          <label class="page-size-control">
            <span>每页</span>
            <select id="detailPageSize">
              ${[10, 20, 50].map((size) => `<option value="${size}" ${state.detailPageSize === size ? "selected" : ""}>${size} 条</option>`).join("")}
            </select>
          </label>
        </div>
      </div>
      ${detailTable(state.detail?.items || [])}
    </section>
  `);
  bindHeaderControls();
  bindDetailControls();
  document.querySelectorAll("[data-confirm]").forEach((button) => button.addEventListener("click", () => confirmVersion(button.dataset.confirm)));
  document.querySelectorAll("[data-recalc]").forEach((button) => button.addEventListener("click", () => recalculateVersion(button.dataset.recalc)));
  document.querySelectorAll("[data-delete-version]").forEach((button) => {
    button.addEventListener("click", () => deleteVersion(button.dataset.deleteVersion, button.dataset.versionName));
  });
}

function versionTable() {
  if (!state.versions.length) return `<div class="muted">暂无版本，请先上传底表。</div>`;
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>SKU</th><th>版本</th><th>状态</th><th>含税总成本</th><th>不含税总成本</th><th>缺价数</th><th>创建时间</th><th>操作</th></tr></thead>
      <tbody>${state.versions.map((v) => `
        <tr>
          <td>${h(v.sku)}</td><td>${h(v.version_name)}</td><td>${statusPill(v.status)}</td>
          <td>${money(v.total_tax_included)}</td><td>${money(v.total_tax_excluded)}</td><td>${h(v.missing_price_count)}</td><td>${h((v.created_at || "").slice(0, 19))}</td>
          <td class="row">
            <button class="secondary" data-recalc="${h(v.version_id)}">复算</button>
            <button data-confirm="${h(v.version_id)}" ${v.missing_price_count ? "disabled" : ""}>确认</button>
            <button class="danger" data-delete-version="${h(v.version_id)}" data-version-name="${h(v.version_name)}">删除</button>
          </td>
        </tr>
      `).join("")}</tbody>
    </table></div>
  `;
}

function detailTable(items) {
  if (!items.length) return `<div class="muted">选择版本后展示成本明细。</div>`;
  const keyword = state.detailMaterialSearch.trim().toLowerCase();
  const filteredItems = keyword
    ? items.filter((item) => String(item.material_code || "").toLowerCase().includes(keyword))
    : items;
  const total = filteredItems.length;
  const totalPages = Math.max(Math.ceil(total / state.detailPageSize), 1);
  const currentPage = Math.min(Math.max(state.detailPage, 1), totalPages);
  state.detailPage = currentPage;
  const start = (currentPage - 1) * state.detailPageSize;
  const pageItems = filteredItems.slice(start, start + state.detailPageSize);
  if (!pageItems.length) {
    return `
      <div class="muted">没有匹配的物料编码。</div>
      ${detailPager(total, totalPages, currentPage, 0, 0)}
    `;
  }
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>层级</th><th>末级</th><th>物料编码</th><th>物料名称</th><th>工段</th><th>用量</th><th>含税单价</th><th>税率</th><th>委外费</th><th>含税成本</th><th>不含税成本</th><th>价格状态</th></tr></thead>
      <tbody>${pageItems.map((i) => `
        <tr>
          <td>${h(i.level)}</td><td>${i.is_leaf ? "是" : "否"}</td><td>${h(i.material_code)}</td><td>${h(i.material_name)}</td><td>${h(i.stage)}</td>
          <td>${h(i.quantity)}</td><td>${i.purchase_price_tax_included === null ? "-" : money(i.purchase_price_tax_included)}</td><td>${pct(i.tax_rate)}</td><td>${money(i.outsourcing_fee)}</td>
          <td>${money(i.total_cost_tax_included)}</td><td>${money(i.total_cost_tax_excluded)}</td><td>${i.price_status === "MISSING_PRICE" ? '<span class="pill bad">缺价</span>' : '<span class="pill ok">正常</span>'}</td>
        </tr>`).join("")}</tbody>
    </table></div>
    ${detailPager(total, totalPages, currentPage, start + 1, start + pageItems.length)}
  `;
}

function detailPager(total, totalPages, currentPage, start, end) {
  return `
    <div class="pagination">
      <div class="muted">共 ${h(total)} 条${total ? `，当前 ${h(start)}-${h(end)} 条` : ""}</div>
      <div class="row">
        <button class="secondary" data-detail-page="prev" ${currentPage <= 1 ? "disabled" : ""}>上一页</button>
        <span class="page-indicator">第 ${h(currentPage)} / ${h(totalPages)} 页</span>
        <button class="secondary" data-detail-page="next" ${currentPage >= totalPages ? "disabled" : ""}>下一页</button>
      </div>
    </div>
  `;
}

function bindDetailControls() {
  const search = document.querySelector("#detailMaterialSearch");
  const searchButton = document.querySelector("#detailSearchButton");
  const clearButton = document.querySelector("#detailClearButton");
  const pageSize = document.querySelector("#detailPageSize");
  if (search) {
    search.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        state.detailMaterialSearch = search.value.trim();
        state.detailPage = 1;
        renderVersions();
      }
    });
  }
  if (searchButton) {
    searchButton.addEventListener("click", () => {
      state.detailMaterialSearch = search.value.trim();
      state.detailPage = 1;
      renderVersions();
    });
  }
  if (clearButton) {
    clearButton.addEventListener("click", () => {
      state.detailMaterialSearch = "";
      state.detailPage = 1;
      renderVersions();
    });
  }
  if (pageSize) {
    pageSize.addEventListener("change", () => {
      state.detailPageSize = Number(pageSize.value);
      state.detailPage = 1;
      renderVersions();
    });
  }
  document.querySelectorAll("[data-detail-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.detailPage += button.dataset.detailPage === "next" ? 1 : -1;
      renderVersions();
    });
  });
}

async function confirmVersion(id) {
  try {
    await api(API.confirm(id), { method: "POST" });
    state.notice = "版本已确认。";
    await refresh();
  } catch (err) {
    state.error = err.message;
    render();
  }
}

async function recalculateVersion(id) {
  try {
    await api(API.recalculate(id), { method: "POST" });
    state.notice = "复算完成。";
    await refresh();
  } catch (err) {
    state.error = err.message;
    render();
  }
}

async function deleteVersion(id, versionName) {
  if (!window.confirm(`确定删除版本「${versionName || id}」吗？删除后该版本的成本明细、缺价风险和版本差异将不再展示。`)) {
    return;
  }
  try {
    await api(API.deleteVersion(id), { method: "DELETE" });
    if (state.selectedVersionId === id) {
      state.selectedVersionId = "";
      state.detailMaterialSearch = "";
      state.detailPage = 1;
    }
    state.notice = "版本已删除。";
    await refresh();
  } catch (err) {
    state.error = err.message;
    render();
  }
}

function renderDiffs() {
  shell(`
    ${header("版本对比", "自动识别物料变化，并允许人工修订差异原因")}
    <section class="panel">
      ${diffTable(state.diffs || [], true)}
    </section>
  `);
  bindHeaderControls();
  document.querySelectorAll("[data-save-reason]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.saveReason;
      const textarea = document.querySelector(`[data-reason="${id}"]`);
      try {
        await api(API.diff(id), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manual_reason: textarea.value, edited_by: "system" }),
        });
        state.notice = "差异原因已保存。";
        await refresh();
      } catch (err) {
        state.error = err.message;
        render();
      }
    });
  });
}

function diffTable(rows, editable) {
  if (!rows.length) return `<div class="muted">暂无版本差异。上传同 SKU 的第二个版本后会自动生成对比。</div>`;
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>物料编码</th><th>物料名称</th><th>差异类型</th><th>上一版本成本</th><th>当前版本成本</th><th>差异金额</th><th>差异比例</th><th>自动原因</th>${editable ? "<th>人工原因</th><th>操作</th>" : ""}</tr></thead>
      <tbody>${rows.map((d) => `
        <tr>
          <td>${h(d.material_code)}</td><td>${h(d.material_name)}</td><td>${h(d.diff_type)}</td><td>${money(d.previous_cost)}</td><td>${money(d.current_cost)}</td><td>${money(d.diff_amount)}</td><td>${pct(d.diff_ratio)}</td><td>${h(d.auto_reason)}</td>
          ${editable ? `<td><textarea data-reason="${h(d.diff_id)}">${h(d.manual_reason || "")}</textarea><div class="muted">${h(d.edited_by || "")} ${h((d.edited_at || "").slice(0, 19))}</div></td><td><button data-save-reason="${h(d.diff_id)}">保存</button></td>` : ""}
        </tr>
      `).join("")}</tbody>
    </table></div>
  `;
}

function renderRules() {
  shell(`
    ${header("规则口径", "本次交付确认后的 MVP 业务规则")}
    <section class="panel">
      <div class="table-wrap"><table>
        <thead><tr><th>规则</th><th>当前口径</th><th>系统处理</th></tr></thead>
        <tbody>
          <tr><td>数据获取</td><td>本地上传 + 数据库存储 + 可复算</td><td>保存原始文件、解析快照、核算结果</td></tr>
          <tr><td>上传方式</td><td>一张底表上传</td><td>解析 BOM、采购单价、税率、委外加工费</td></tr>
          <tr><td>BOM边界</td><td>一个文件一个 SKU</td><td>多 SKU 阻断上传</td></tr>
          <tr><td>金额精度</td><td>小数点后两位</td><td>核算与导出使用 ROUND(..., 2)</td></tr>
          <tr><td>价格有效期</td><td>暂不考虑</td><td>不按生效/失效日期筛选</td></tr>
          <tr><td>价格缺失</td><td>允许底表入库，但阻断确认/发布</td><td>dashboard 风险区展示缺价物料和所属工段</td></tr>
          <tr><td>币种</td><td>仅人民币 CNY</td><td>非 CNY 阻断</td></tr>
          <tr><td>含税/不含税</td><td>支持展示口径切换</td><td>不含税 = 含税价 / (1 + 税率)</td></tr>
          <tr><td>差异原因</td><td>允许人工修订并保存</td><td>保存人工原因、修订人、修订时间</td></tr>
        </tbody>
      </table></div>
    </section>
  `);
  bindHeaderControls();
}

refresh();

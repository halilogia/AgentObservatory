// @ts-mandatory: Tarayıcıda sıfır-derleme (zero-build CSP script-src self) ile doğrudan çalışan Çoklu Hesap Havuzu arayüz modülüdür.
(function (root) {
  'use strict';

  var ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="5.2" r="2.3"/><path d="M2.2 13c0-2.1 1.7-3.6 3.8-3.6s3.8 1.5 3.8 3.6"/><circle cx="11.3" cy="5.8" r="1.8"/><path d="M11.5 9.6c1.6.2 2.7 1.4 2.7 3.1"/></svg>';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function defaultT(key, params) {
    if (root.ObsI18n && typeof root.ObsI18n.t === 'function') {
      return root.ObsI18n.t(key, params);
    }
    return key;
  }

  async function defaultApi(path, body) {
    var meta = typeof document !== 'undefined' ? document.querySelector('meta[name="obs-token"]') : null;
    var token = meta ? meta.content : '';
    var r = await fetch(path, body === undefined ? {} : {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-observatory-token': token },
      body: JSON.stringify(body)
    });
    var j = {};
    try {
      j = await r.json();
    } catch (err) {
      if (typeof console !== 'undefined' && console.debug) console.debug('[ObsAccounts] non-json response:', err);
    }
    if (!r.ok) {
      var e = new Error(j.error || ('HTTP ' + r.status));
      e.info = j;
      throw e;
    }
    return j;
  }

  function defaultApiMsg(err, tFn) {
    var i = (err && err.info) || {};
    return i.code ? tFn('api.' + i.code, i.params || {}) : (err && err.message) || 'Hata';
  }

  async function open(opts) {
    if (typeof document === 'undefined' || document.querySelector('.dlg')) return;
    var o = opts || {};
    var t = o.t || defaultT;
    var api = o.api || defaultApi;
    var apiMsg = o.apiMsg || function (err) { return defaultApiMsg(err, t); };
    var onChanged = o.onChanged || function () {};
    var savedEngine = 'agy';
    try {
      var stRaw = JSON.parse(root.localStorage.getItem('obs-web') || '{}');
      if (stRaw && stRaw.engine === 'claude') savedEngine = 'claude';
    } catch (err) {
      if (typeof console !== 'undefined' && console.debug) console.debug('[ObsAccounts] localStorage read:', err);
    }
    var cur = o.currentEngine ? (o.currentEngine === 'claude' ? 'claude' : 'agy') : savedEngine;
    var accounts = [];

    try {
      var res = await api('/api/accounts');
      accounts = (res && res.accounts) || [];
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[ObsAccounts] initial load failed:', err);
    }

    var ov = el('div', 'dlg');
    var box = el('div', 'dlgbox caps acc-box');
    box.setAttribute('role', 'dialog');

    var tabs = el('div', 'ctabs');
    var list = el('div', 'clist acc-list');
    var formBox = el('div', 'acc-form');
    var feedback = el('div', 'acc-feedback');

    var close = function () {
      ov.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    var onKey = function (ev) {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        close();
      }
    };

    function nextSuggestedName(agent) {
      var existing = accounts.filter(function (a) { return a.agent === agent; }).map(function (a) { return a.name; });
      for (var i = 1; i <= 9; i++) {
        var cand = 'pro' + i;
        if (existing.indexOf(cand) === -1) return cand;
      }
      return '';
    }

    function setFeedback(msg, errFlag) {
      var statusMsg = msg || '';
      var isErr = !!errFlag;
      feedback.textContent = statusMsg;
      feedback.className = 'acc-feedback' + (statusMsg ? (isErr ? ' err' : ' ok') : '');
      feedback.hidden = !statusMsg;
    }

    function paint() {
      tabs.replaceChildren();
      list.replaceChildren();
      formBox.replaceChildren();

      var engines = [
        { id: 'agy', label: 'Antigravity (agy)', color: '#4285F4' },
        { id: 'claude', label: 'Claude Code', color: '#D97757' }
      ];
      engines.forEach(function (e) {
        var count = accounts.filter(function (a) { return a.agent === e.id; }).length;
        var b = el('button', 'ctab' + (e.id === cur ? ' on' : ''), e.label + ' (' + count + ')');
        b.type = 'button';
        b.style.setProperty('--c', e.color);
        b.onclick = function () {
          cur = e.id;
          setFeedback('', false);
          paint();
        };
        tabs.appendChild(b);
      });

      var filtered = accounts.filter(function (a) { return a.agent === cur; });
      list.appendChild(el('div', 'hgroup', t('acc.poolList') + ' · ' + filtered.length));

      if (!filtered.length) {
        list.appendChild(el('div', 'cnone', t('acc.none')));
      } else {
        filtered.forEach(function (a) {
          var row = el('div', 'crow drow acc-row');
          var info = el('div', 'acc-info');
          var head = el('div', 'cname', a.name + (a.label ? ' — ' + a.label : ''));
          if (a.isActive) {
            head.appendChild(el('span', 'cbadge acc-badge-active', t('acc.active')));
          }
          var stateBadge = el(
            'span',
            'cbadge ' + (a.isAvailable ? 'acc-badge-ready' : 'acc-badge-wait'),
            a.isAvailable
              ? t('acc.ready')
              : t('acc.cooldown', { min: Math.max(1, Math.ceil((a.remainingCooldownMs || 60000) / 60000)) })
          );
          head.appendChild(stateBadge);
          info.appendChild(head);
          if (a.lastError && !a.isAvailable) {
            info.appendChild(el('div', 'cdesc', a.lastError));
          }
          row.appendChild(info);

          var actions = el('div', 'acc-actions');
          if (!a.isActive) {
            var sw = el('button', '', t('acc.switchBtn'));
            sw.type = 'button';
            sw.onclick = async function () {
              try {
                var r = await api('/api/accounts', { action: 'switch', agent: cur, name: a.name });
                accounts = r.accounts || [];
                setFeedback(t('acc.switchedOk', { name: a.name }), false);
                onChanged();
                paint();
              } catch (err) {
                setFeedback(apiMsg(err), true);
              }
            };
            actions.appendChild(sw);
          }
          if (!a.isAvailable) {
            var cl = el('button', '', t('acc.clearBtn'));
            cl.type = 'button';
            cl.onclick = async function () {
              try {
                var r = await api('/api/accounts', { action: 'clear', agent: cur, name: a.name });
                accounts = r.accounts || [];
                setFeedback('', false);
                onChanged();
                paint();
              } catch (err) {
                setFeedback(apiMsg(err), true);
              }
            };
            actions.appendChild(cl);
          }
          var rm = el('button', 'del', t('acc.removeBtn'));
          rm.type = 'button';
          rm.onclick = async function () {
            try {
              var r = await api('/api/accounts', { action: 'remove', agent: cur, name: a.name });
              accounts = r.accounts || [];
              setFeedback('', false);
              onChanged();
              paint();
            } catch (err) {
              setFeedback(apiMsg(err), true);
            }
          };
          actions.appendChild(rm);
          row.appendChild(actions);
          list.appendChild(row);
        });
      }

      formBox.appendChild(el('div', 'hgroup', t('acc.stepTitle')));
      formBox.appendChild(el('p', 'cdesc acc-hint', t(cur === 'agy' ? 'acc.agyHint' : 'acc.claudeHint')));

      var inputs = el('div', 'acc-inputs');
      var nameIn = el('input', 'addin');
      nameIn.type = 'text';
      nameIn.spellcheck = false;
      nameIn.placeholder = t('acc.namePh');
      nameIn.value = nextSuggestedName(cur);

      var labelIn = el('input', 'addin');
      labelIn.type = 'text';
      labelIn.placeholder = t('acc.labelPh');

      inputs.append(nameIn, labelIn);
      formBox.appendChild(inputs);

      var btnRow = el('div', 'acc-btns');
      var loginBtn = el('button', '', t('acc.openLogin'));
      loginBtn.type = 'button';
      loginBtn.onclick = async function () {
        var nm = nameIn.value.trim();
        var lb = labelIn.value.trim();
        try {
          var r = await api('/api/accounts', { action: 'login', agent: cur, name: nm || undefined, label: lb || undefined });
          if (r && r.accounts) accounts = r.accounts;
          setFeedback(t('acc.loginOpened'), false);
          onChanged();
          paint();
        } catch (err) {
          setFeedback(apiMsg(err), true);
        }
      };

      var saveBtn = el('button', 'primary', t('acc.saveCurrent'));
      saveBtn.type = 'button';
      saveBtn.onclick = async function () {
        var nm = nameIn.value.trim();
        var lb = labelIn.value.trim();
        if (!nm) {
          nameIn.focus();
          setFeedback(t('api.acc_name_needed'), true);
          return;
        }
        try {
          var r = await api('/api/accounts', { action: 'save', agent: cur, name: nm, label: lb || undefined });
          accounts = r.accounts || [];
          setFeedback(t('acc.savedOk', { name: nm }), false);
          onChanged();
          paint();
        } catch (err) {
          setFeedback(apiMsg(err), true);
        }
      };

      btnRow.append(loginBtn, saveBtn);
      formBox.appendChild(btnRow);
    }

    setFeedback('', false);
    var closeBtn = el('button', '', t('caps.close'));
    closeBtn.type = 'button';
    closeBtn.onclick = close;
    ov.onclick = function (ev) { if (ev.target === ov) close(); };

    box.append(el('p', 'ctitle', t('acc.title')), el('p', 'cdesc', t('acc.intro')), tabs, list, formBox, feedback, closeBtn);
    document.addEventListener('keydown', onKey, true);
    ov.appendChild(box);
    document.body.appendChild(ov);
    paint();
  }

  function bindDom() {
    if (typeof document === 'undefined') return;
    var btn = document.querySelector('#accBtn');
    var ico = document.querySelector('#accIco');
    if (ico) ico.innerHTML = ICON;
    if (btn) {
      btn.onclick = function () {
        open({});
      };
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindDom);
    } else {
      bindDom();
    }
  }

  root.ObsAccounts = {
    ICON: ICON,
    open: open,
    bindDom: bindDom
  };
})(typeof window !== 'undefined' ? window : globalThis);

(function () {
  'use strict';
  function el(tag, text) {
    var node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function safeUrl(value) {
    try {
      var url = new URL(value);
      return /^(https?:|mailto:)$/.test(url.protocol) ? url.href : null;
    } catch (_) { return null; }
  }
  function inline(parent, source, depth) {
    source = String(source || '');
    if ((depth || 0) > 8) { parent.appendChild(document.createTextNode(source)); return; }
    var token = /(`+)([\s\S]*?)\1|!\[([^\]]*)\]\(([^)]*)\)|\[([^\]]+)\]\(([^)]*)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_|\\([\\`*{}\[\]()#+.!_>-])/g;
    var last = 0, match;
    while ((match = token.exec(source))) {
      parent.appendChild(document.createTextNode(source.slice(last, match.index)));
      var node;
      if (match[1]) node = el('code', match[2]);
      else if (match[3] !== undefined) node = document.createTextNode(match[3]);
      else if (match[5] !== undefined) {
        var href = safeUrl(match[6]);
        node = el(href ? 'a' : 'span');
        if (href) { node.href = href; node.target = '_blank'; node.rel = 'noopener noreferrer'; }
        inline(node, match[5], (depth || 0) + 1);
      } else if (match[7] !== undefined || match[8] !== undefined) {
        node = el('strong'); inline(node, match[7] !== undefined ? match[7] : match[8], (depth || 0) + 1);
      } else if (match[9] !== undefined || match[10] !== undefined) {
        node = el('em'); inline(node, match[9] !== undefined ? match[9] : match[10], (depth || 0) + 1);
      } else node = document.createTextNode(match[11]);
      parent.appendChild(node); last = token.lastIndex;
    }
    parent.appendChild(document.createTextNode(source.slice(last)));
  }
  function tableCells(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(function (cell) { return cell.trim().replace(/\\\|/g, '|'); });
  }
  function tableDivider(line) { return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line || ''); }
  function listMatch(line) { return /^(\s*)([-+*]|\d+[.)])\s+(.+)$/.exec(line); }
  function startsBlock(lines, i) {
    var line = lines[i] || '';
    return /^\s*$|^\s{0,3}#{1,6}\s|^\s*(`{3,}|~{3,})|^\s*>|^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line) || !!listMatch(line) || (line.indexOf('|') !== -1 && tableDivider(lines[i + 1]));
  }
  function blocks(parent, lines, depth) {
    if ((depth || 0) > 12) { parent.appendChild(el('p', lines.join('\n'))); return; }
    var i = 0;
    while (i < lines.length) {
      var line = lines[i], match, node;
      if (!line.trim()) { i++; continue; }
      if ((match = /^\s*(`{3,}|~{3,})(.*)$/.exec(line))) {
        var fence = match[1], code = []; i++;
        while (i < lines.length && !new RegExp('^\\s*' + fence[0] + '{' + fence.length + ',}\\s*$').test(lines[i])) code.push(lines[i++]);
        if (i < lines.length) i++;
        node = el('pre'); node.appendChild(el('code', code.join('\n'))); parent.appendChild(node); continue;
      }
      if ((match = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line))) {
        node = el('h' + match[1].length); inline(node, match[2]); parent.appendChild(node); i++; continue;
      }
      if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { parent.appendChild(el('hr')); i++; continue; }
      if (/^\s*>/.test(line)) {
        var quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
        node = el('blockquote'); blocks(node, quote, (depth || 0) + 1); parent.appendChild(node); continue;
      }
      if (line.indexOf('|') !== -1 && tableDivider(lines[i + 1])) {
        var headers = tableCells(line), aligns = tableCells(lines[i + 1]);
        var wrapper = el('div'); wrapper.className = 'heartball-markdown-table';
        var table = el('table'), head = el('thead'), tr = el('tr'), body = el('tbody');
        headers.forEach(function (cell, index) { var th = el('th'); inline(th, cell); th.scope = 'col'; if (/^:.*:$/.test(aligns[index] || '')) th.style.textAlign = 'center'; else if (/:$/.test(aligns[index] || '')) th.style.textAlign = 'right'; tr.appendChild(th); });
        head.appendChild(tr); table.appendChild(head); i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') !== -1) {
          var cells = tableCells(lines[i++]); tr = el('tr');
          headers.forEach(function (_, index) { var td = el('td'); inline(td, cells[index] || ''); if (/^:.*:$/.test(aligns[index] || '')) td.style.textAlign = 'center'; else if (/:$/.test(aligns[index] || '')) td.style.textAlign = 'right'; tr.appendChild(td); });
          body.appendChild(tr);
        }
        table.appendChild(body); wrapper.appendChild(table); parent.appendChild(wrapper); continue;
      }
      if ((match = listMatch(line))) {
        var indent = match[1].length, ordered = /^\d/.test(match[2]);
        node = el(ordered ? 'ol' : 'ul');
        if (ordered && parseInt(match[2], 10) !== 1) node.start = parseInt(match[2], 10);
        while (i < lines.length) {
          match = listMatch(lines[i]);
          if (!match || match[1].length !== indent || /^\d/.test(match[2]) !== ordered) break;
          var item = el('li'), continuation = []; inline(item, match[3]); i++;
          while (i < lines.length && lines[i].trim() && (/^\s*/.exec(lines[i])[0].length > indent)) {
            continuation.push(lines[i++].slice(indent + 2));
          }
          if (continuation.length) blocks(item, continuation, (depth || 0) + 1);
          node.appendChild(item);
        }
        parent.appendChild(node); continue;
      }
      var paragraph = [line]; i++;
      while (i < lines.length && !startsBlock(lines, i)) paragraph.push(lines[i++]);
      node = el('p'); inline(node, paragraph.join('\n')); parent.appendChild(node);
    }
  }
  function render(value) {
    var fragment = document.createDocumentFragment(), wrapper = el('div');
    wrapper.className = 'heartball-markdown';
    blocks(wrapper, String(value == null ? '' : value).replace(/\r\n?/g, '\n').split('\n'), 0);
    fragment.appendChild(wrapper); return fragment;
  }
  function plain(value) {
    var root = render(value).firstChild, output = [];
    function walk(node) {
      if (node.nodeType === 3) { output.push(node.nodeValue); return; }
      var tag = node.tagName || '';
      if (tag === 'LI') output.push('• ');
      if (tag === 'HR') output.push('\n');
      Array.prototype.forEach.call(node.childNodes, walk);
      if (/^(P|H[1-6]|LI|BLOCKQUOTE|PRE|TR|DIV)$/.test(tag)) output.push('\n');
      else if (/^(TH|TD)$/.test(tag)) output.push('\t');
    }
    walk(root);
    return output.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  window.HeartballMarkdown = Object.freeze({ render: render, plain: plain });
})();

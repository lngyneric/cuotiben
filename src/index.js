// 错题本 Worker：静态资源托管 + Workers AI 生成类似题 + 问答判分
var MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
var JUDGE_MODEL = '@cf/cloudflare/clef-flash';

// 从 Workers AI 返回中提取文本（兼容多种返回格式）
function aiText(out) {
  if (!out) return '';
  if (typeof out.response === 'string') return out.response;
  if (out.choices && out.choices[0] && out.choices[0].message) return out.choices[0].message.content || '';
  if (typeof out.result === 'string') return out.result;
  if (typeof out === 'string') return out;
  return '';
}
function cleanJson(txt) {
  return String(txt).trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
}

export default {
  async fetch(req, env) {
    var u = new URL(req.url);

    if (u.pathname === '/api/health') {
      return Response.json({ ok: true, model: MODEL });
    }

    if (u.pathname === '/api/similar') {
      if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });
      var b;
      try { b = await req.json(); } catch (e) { return Response.json({ error: 'bad json' }, { status: 400 }); }
      var q = String(b.question || '').slice(0, 800);
      var a = String(b.answer || '').slice(0, 800);
      var p = String(b.principle || '').slice(0, 800);
      var s = String(b.subject || '数学').slice(0, 20);
      if (!q) return Response.json({ error: '题目不能为空' }, { status: 400 });

      var sys = '你是初中数学老师，擅长针对错题出同类练习题。严格只返回 JSON，不要输出任何解释文字。题目中的数字尽量取整齐、好算；出题后必须逐步验算答案里的每一个数字，数字算错比不出题更有害。';
      var user =
        '根据下面这道错题，出 1 道同类型、同难度、同考点的练习题（换数字和情境，不要重复原题）。\n' +
        '只返回 JSON：{"question":"题干","answer":"答案（含关键计算步骤，如 x∈[4.45,4.55)，上界=3×4.55=13.65）","hint":"一句话解题关键提示"}\n\n' +
        '学科：' + s + '\n错题题干：' + q + '\n正确答案：' + a + '\n考查原理：' + p;

      try {
        var out = await env.AI.run(MODEL, {
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: user }
          ],
          max_tokens: 600
        });
        var txt = '';
        if (out) {
          if (typeof out.response === 'string') txt = out.response;
          else if (out.choices && out.choices[0] && out.choices[0].message) txt = out.choices[0].message.content || '';
          else if (typeof out.result === 'string') txt = out.result;
          else if (typeof out === 'string') txt = out;
        }
        txt = String(txt).trim()
          .replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
        var j;
        try { j = JSON.parse(txt); }
        catch (e) { return Response.json({ raw: txt }); }
        return Response.json({
          question: String(j.question || ''),
          answer: String(j.answer || ''),
          hint: String(j.hint || '')
        });
      } catch (e) {
        return Response.json({ error: 'AI 调用失败，请稍后重试' }, { status: 502 });
      }
    }

    if (u.pathname === '/api/qa') {
      if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });
      var b;
      try { b = await req.json(); } catch (e) { return Response.json({ error: 'bad json' }, { status: 400 }); }
      var action = String(b.action || '');
      var q = String(b.question || '').slice(0, 1000);
      var a = String(b.answer || '').slice(0, 1000);
      var p = String(b.principle || '').slice(0, 800);
      var s = String(b.subject || '').slice(0, 20);
      var lang = /[\u4e00-\u9fff]/.test(q + s) ? '中文' : 'English';

      // --- 生成解题思路选项（数学）---
      if (action === 'approaches') {
        if (!q) return Response.json({ error: '题目不能为空' }, { status: 400 });
        var myA = String(b.myAnswer || '').slice(0, 500);
        var sysA = '你是初中老师，擅长设计选择题干扰项。严格只返回 JSON，不要输出任何解释文字。';
        var userA =
          '下面是一道错题。请生成 4 个"解题思路"选项（1 个正确，3 个错误），再加 1 道追问。\n' +
          '要求：\n' +
          '- 正确选项：描述正确的解题思路/策略（1-2 句话，不说具体答案数字）。\n' +
          '- 错误选项：必须是学生常见的真实误区。其中 1 个要基于"学生错答"改写（还原他当时的错误思路）；另外 2 个是同类题的典型误区。\n' +
          '- 每个选项 1-2 句话，简洁。\n' +
          '- 追问：针对核心概念问 1 个"为什么"或"依据是什么"，迫使学生澄清概念（1 句话）。\n' +
          '- 语言：' + lang + '。\n' +
          '只返回 JSON：{"options":[{"text":"...","correct":true},{"text":"...","correct":false},{"text":"...","correct":false},{"text":"...","correct":false}],"followup":"..."}\n\n' +
          '学科：' + s + '\n题干：' + q + '\n正确答案：' + a + '\n考查原理：' + p + '\n学生错答：' + (myA || '（无）');
        try {
          var outA = await env.AI.run(MODEL, {
            messages: [{ role: 'system', content: sysA }, { role: 'user', content: userA }],
            max_tokens: 800
          });
          var jA;
          try { jA = JSON.parse(cleanJson(aiText(outA))); }
          catch (e) { return Response.json({ error: 'AI 返回格式异常' }, { status: 502 }); }
          var opts = (jA.options || []).slice(0, 4).map(function (o) {
            return { text: String(o.text || ''), correct: !!o.correct };
          });
          if (opts.length < 2 || !opts.some(function (o) { return o.correct; })) {
            return Response.json({ error: 'AI 生成选项失败' }, { status: 502 });
          }
          // 打乱顺序
          for (var i = opts.length - 1; i > 0; i--) {
            var r = Math.floor(Math.random() * (i + 1));
            var t = opts[i]; opts[i] = opts[r]; opts[r] = t;
          }
          return Response.json({ options: opts, followup: String(jA.followup || '') });
        } catch (e) {
          return Response.json({ error: 'AI 调用失败，请稍后重试' }, { status: 502 });
        }
      }

      // --- 判分（自由文本，Clef）---
      if (action === 'judge') {
        var student = String(b.student || '').slice(0, 1000);
        if (!q || !student) return Response.json({ error: '题目和回答不能为空' }, { status: 400 });
        try {
          var outJ = await env.AI.run(JUDGE_MODEL, {
            messages: [
              { role: 'system', content: 'You are a strict but fair grader. Judge whether the student answer is correct.' },
              { role: 'user', content: 'Question: ' + q + '\nExpected answer: ' + a + '\nStudent answer: ' + student + '\n\nIs the student answer correct?' }
            ],
            criteria: {
              correct: 'The student answer captures the key points or meaning of the expected answer (wording may differ, language may differ)',
              incorrect: 'The student answer is wrong, contradicts the expected answer, or misses the key points'
            }
          });
          var choice = '', conf = 0;
          try {
            var route = outJ.answers.route;
            choice = String(route.choice || '');
            conf = Number(route.confidence || 0);
          } catch (e) {}
          // 兜底：如果解析失败，用关键词启发式
          if (!choice) {
            var low = (a + ' ' + student).toLowerCase();
            choice = 'incorrect'; conf = 0.5;
          }
          return Response.json({ correct: choice === 'correct', confidence: conf });
        } catch (e) {
          return Response.json({ error: '判分失败，请稍后重试' }, { status: 502 });
        }
      }

      // --- 生成提示（不直接给答案）---
      if (action === 'hint') {
        var studentH = String(b.student || '').slice(0, 1000);
        var attempt = Math.min(Number(b.attempt || 1), 5);
        if (!q) return Response.json({ error: '题目不能为空' }, { status: 400 });
        var sysH = '你是初中老师，擅长给提示但不直接给答案。只返回提示文字（1-2 句话），不要输出答案。';
        var userH =
          '学生在一道题上答错了。请给 1 个提示，帮他自己想出正确思路。只提示方向/关键概念，不说答案或具体步骤。语言：' + lang + '。\n\n' +
          '题干：' + q + '\n考查原理：' + p + '\n学生回答：' + (studentH || '（未回答）') + '\n已尝试次数：' + attempt +
          (attempt >= 3 ? '\n（已多次尝试，提示可以更具体一些，但仍不要直接给答案）' : '');
        try {
          var outH = await env.AI.run(MODEL, {
            messages: [{ role: 'system', content: sysH }, { role: 'user', content: userH }],
            max_tokens: 200
          });
          return Response.json({ hint: cleanJson(aiText(outH)) });
        } catch (e) {
          return Response.json({ error: 'AI 调用失败，请稍后重试' }, { status: 502 });
        }
      }

      // --- 生成追问（答对后深挖概念）---
      if (action === 'followup') {
        if (!q) return Response.json({ error: '题目不能为空' }, { status: 400 });
        var sysF = '你是初中老师，擅长通过追问帮学生澄清概念。只返回追问文字（1 句话），不要输出答案。';
        var userF =
          '学生答对了下面这道题。请生成 1 道追问，针对核心概念问"为什么"或"如果条件变化会怎样"，迫使学生真正理解而不是死记。语言：' + lang + '。\n\n' +
          '题干：' + q + '\n正确答案：' + a + '\n考查原理：' + p;
        try {
          var outF = await env.AI.run(MODEL, {
            messages: [{ role: 'system', content: sysF }, { role: 'user', content: userF }],
            max_tokens: 200
          });
          return Response.json({ followup: cleanJson(aiText(outF)) });
        } catch (e) {
          return Response.json({ error: 'AI 调用失败，请稍后重试' }, { status: 502 });
        }
      }

      return Response.json({ error: '未知 action' }, { status: 400 });
    }

    return env.ASSETS.fetch(req);
  }
};

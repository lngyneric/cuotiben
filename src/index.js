// 错题本 Worker：静态资源托管 + Workers AI 生成类似题
var MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

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

    return env.ASSETS.fetch(req);
  }
};

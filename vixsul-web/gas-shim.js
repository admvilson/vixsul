/**
 * gas-shim.js — Polyfill de google.script.run para Vercel/Supabase
 *
 * Cada acesso a `google.script.run` retorna um novo contexto, exatamente
 * como o GAS faz. Basta adicionar este arquivo no <head> do index.html.
 */
(function () {
  const BASE = '';   // vazio = mesmo domínio; mude se hospedar a API em outro lugar

  function makeRunner() {
    let _ok  = null;
    let _err = null;

    function call(endpoint, args) {
      fetch(BASE + '/api/' + endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(args)
      })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (data) { if (_ok)  _ok(data);  })
        .catch(function (err) { if (_err) _err(err);  });
    }

    const runner = {
      withSuccessHandler: function (fn) { _ok  = fn; return runner; },
      withFailureHandler: function (fn) { _err = fn; return runner; },

      getSistemaData:     function ()           { call('getSistemaData',     []); },
      upsertRegistro:     function (a, b, c)    { call('upsertRegistro',     [a, b, c]); },
      excluirRegistro:    function (a, b)       { call('excluirRegistro',    [a, b]); },
      salvarComposicaoCAP:function (a, b, c, d) { call('salvarComposicaoCAP',[a, b, c, d]); },
      excluirComposicaoCAP:function (a, b)      { call('excluirComposicaoCAP',[a, b]); },
      login:              function (a, b)       { call('login',              [a, b]); }
    };

    return runner;
  }

  // Recria o contexto a cada acesso (comportamento idêntico ao GAS)
  window.google = {
    script: {
      get run() { return makeRunner(); }
    }
  };
})();

// Preview bridge source, part 17 of 17. Section 6: runtime error capture, and closes the IIFE.
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
export default `  // ------------------------------------------------------------------
  // 6. Runtime error capture
  // ------------------------------------------------------------------
  var lastReportedError = '';
  var lastReportedTime = 0;

  function reportRuntimeError(msg, line, col) {
    if (!msg) return;
    if (msg === 'Script error.' || msg === 'Script error') {
      msg = 'Script execution error' + (line ? ' at line ' + line : '');
    }
    var now = Date.now();
    var key = msg + ':' + (line || 0);
    if (key === lastReportedError && (now - lastReportedTime) < 1000) {
      return;
    }
    lastReportedError = key;
    lastReportedTime = now;
    post('runtime_error', { message: msg, line: line, col: col });
  }

  window.addEventListener('error', function(e) {
    var msg = (e && e.message) ? e.message : '';
    if ((!msg || msg === 'Script error.' || msg === 'Script error') && e && e.error && e.error.message) {
      msg = e.error.message;
    }
    reportRuntimeError(msg || (e && e.error ? String(e.error) : 'Script error'), e && e.lineno, e && e.colno);
  });

  window.onerror = function(message, source, lineno, colno, error) {
    var msg = message;
    if ((!msg || msg === 'Script error.' || msg === 'Script error') && error && error.message) {
      msg = error.message;
    }
    reportRuntimeError(msg || 'Script error', lineno, colno);
  };

  window.addEventListener('unhandledrejection', function(e) {
    var reason = e ? e.reason : null;
    var msg = reason ? (reason.message || String(reason)) : 'Unhandled Promise Rejection';
    reportRuntimeError(msg);
  });

  var origConsoleError = console.error;
  console.error = function() {
    try {
      var args = Array.prototype.slice.call(arguments);
      origConsoleError.apply(console, args);
      var errStr = args.map(function(a) {
        return (a && a.stack) ? a.stack : (a && a.message) ? a.message : String(a);
      }).join(' ');
      if (/(?:Error|Exception|Uncaught|TypeError|ReferenceError|SyntaxError)/i.test(errStr)) {
        reportRuntimeError(errStr.slice(0, 300));
      }
    } catch (err) {}
  };

})();`;

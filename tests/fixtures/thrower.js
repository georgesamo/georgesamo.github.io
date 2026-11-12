/* errors.js fixture: real uncaught errors and rejections raised from a site file, inside the iframe's own realm. */
window.throwLater = function (msg) { setTimeout(function () { throw new Error(msg); }, 0); };
window.rejectLater = function (msg) { Promise.reject(new Error(msg)); };

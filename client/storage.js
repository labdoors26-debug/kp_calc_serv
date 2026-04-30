(function () {
  var API = '../server/api.php';
  var TRACKED = ['mc-warehouse-v1', 'idloft_prices'];
  var _orig = localStorage.setItem.bind(localStorage);

  function syncKey(key, value) {
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', key: key, value: value }),
      credentials: 'same-origin'
    }).catch(function () {});
  }

  localStorage.setItem = function (key, value) {
    _orig(key, value);
    if (TRACKED.indexOf(key) !== -1) {
      syncKey(key, value);
    }
  };

  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '?action=load_all', false);
    xhr.withCredentials = true;
    xhr.send(null);

    if (xhr.status === 401) {
      window.location.replace('login.html');
      return;
    }

    if (xhr.status === 200) {
      var data = JSON.parse(xhr.responseText);
      var keys = Object.keys(data);

      if (keys.length === 0) {
        // First run: upload existing localStorage data to server
        var localData = {};
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          localData[k] = localStorage.getItem(k);
        }
        if (Object.keys(localData).length > 0) {
          fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save_all', data: localData }),
            credentials: 'same-origin'
          }).catch(function () {});
        }
      } else {
        for (var j = 0; j < keys.length; j++) {
          _orig(keys[j], data[keys[j]]);
        }
      }
    }
  } catch (e) {
    // Server unreachable — continue with local localStorage only
  }
})();

// Config
L.mapbox.accessToken = config.mapbox;

// Utilities
function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

// Get current UUID
var myUuid = localStorage.getItem('myUuid');
if (!myUuid) {
  myUuid = guid();
  localStorage.setItem('myUuid', myUuid);
}

// Initialize map
var map = L.mapbox.map('map', 'examples.map-i86nkdio', {
  zoomControl: false,
  attributionControl: false,
  tileLayer: {
    maxNativeZoom: 19
  }
}).setView([48.861920, 2.341755], 18)

// Stupid routing
var mapId = location.hash.replace(/^#/, '');
if (!mapId) {
  mapId = (Math.random() + 1).toString(36).substring(7);
  location.hash = mapId;
}

// Firebase
var firebase = new Firebase('https://' + config.firebase + '.firebaseio.com/');
var markersRef = firebase.child('maps/' + mapId);
var markers = {};

var watchPositionId;
map.on('ready', function() {
  watchPositionId = navigator.geolocation.watchPosition(function(position) {
    markersRef.child(myUuid).set({
      coords: position.coords,
      timestamp: Math.floor(Date.now() / 1000)
    })

    map.panTo([position.coords.latitude, position.coords.longitude])
  });

  markersRef.on('child_added', function(childSnapshot) {
    var uuid = childSnapshot.key()
    var position = childSnapshot.val()

    var marker = L.marker([position.coords.latitude, position.coords.longitude], {
      // zIndexOffset: (uuid === myUuid ? 1000 : 0),
      icon: L.mapbox.marker.icon({
        'marker-size': 'large',
        'marker-color': (uuid === myUuid ? '#ff9800' : '#673ab7')
      })
    })
    marker.addTo(map)

    markers[uuid] = marker;
  })

  markersRef.on('child_changed', function(childSnapshot) {
    var uuid = childSnapshot.key()
    var position = childSnapshot.val()

    var marker = markers[uuid]
    marker.setLatLng([position.coords.latitude, position.coords.longitude])
  })

  markersRef.on('child_removed', function(oldChildSnapshot) {
    var uuid = oldChildSnapshot.key()

    map.removeLayer(markers[uuid])
    markers[uuid] = null
  })
});

// Remove old markers
setInterval(function() {
  markersRef.limitToFirst(100).once('value', function(snap) {
    snap.forEach(function(childSnapshot) {
      var uuid = childSnapshot.key()
      var now = Math.floor(Date.now() / 1000)
      if (childSnapshot.val().timestamp < now - 60 * 30) {
        var marker = markers[uuid]
        map.removeLayer(markers[uuid])
        markersRef.child(myUuid).set(null)
        //markers[uuid] = null
      }
    })
  })
}, 5000);

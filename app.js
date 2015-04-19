(function() {
'use strict';

//
// Utilities
//
function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function now() {
  return Math.floor(Date.now() / 1000);
}

//
// Environment
//
var myUuid;
var mapId;

mapId = location.hash.replace(/^#/, '');
if (!mapId) {
  mapId = (Math.random() + 1).toString(36).substring(2, 12);
  location.hash = mapId;
}

if (typeof localStorage == 'undefined') {
  document.getElementById('map').innerHTML = 'Sorry but your browser is not supported'
  return
}

myUuid = localStorage.getItem('myUuid');
if (!myUuid) {
  myUuid = guid();
  localStorage.setItem('myUuid', myUuid);
}


//
// Mapbox
//
var map;
var markers = {};
var mapZooming = false;

L.mapbox.accessToken = config.mapbox.accessToken;

map = L.mapbox.map('map', config.mapbox.mapId, {
  zoomControl: false,
  attributionControl: false,
  tileLayer: {
    maxNativeZoom: 19
  }
}).setView([48.861920, 2.341755], 18)

// map.on('ready', function() { console.log('map.ready') });

// https://github.com/bbecquet/Leaflet.PolylineDecorator
L.RotatedMarker = L.Marker.extend({
  options: { angle: 0 },
  _setPos: function(pos) {
    L.Marker.prototype._setPos.call(this, pos);
    if (L.DomUtil.TRANSFORM) {
      // use the CSS transform rule if available
      this._icon.style[L.DomUtil.TRANSFORM] += ' rotate(' + this.options.angle + 'deg)';
    } else if (L.Browser.ie) {
      // fallback for IE6, IE7, IE8
      var rad = this.options.angle * L.LatLng.DEG_TO_RAD,
      costheta = Math.cos(rad),
      sintheta = Math.sin(rad);
      this._icon.style.filter += ' progid:DXImageTransform.Microsoft.Matrix(sizingMethod=\'auto expand\', M11=' +
        costheta + ', M12=' + (-sintheta) + ', M21=' + sintheta + ', M22=' + costheta + ')';
    }
  }
});
L.rotatedMarker = function(pos, options) {
  return new L.RotatedMarker(pos, options);
};

map.on('zoomstart', function() {
  mapZooming = true
})
map.on('zoomend', function() {
  mapZooming = false
})

function createIcon(uuid, point) {
  var color
  var svg;

  if (uuid === myUuid) {
    // Own marker
    color = '#2196f3'
  } else if (point.timestamp < now() - 60) {
    // Inactive marker
    color = '#bdbdbd'
  } else {
    // Others marker
    color = '#ff9800'
  }

  var svg = '<svg width="70" height="70" xmlns="http://www.w3.org/2000/svg">'
    + '<path fill="#fff" d="m35,18.000002c-9.400002,0 -17,7.599995 -17,16.999998s7.599998,17 17,17s17,-7.599998 17,-17s-7.599998,-16.999998 -17,-16.999998zm0,30.999998c-7.700001,0 -14,-6.299999 -14,-14s6.299999,-13.999998 14,-13.999998s14,6.299997 14,13.999998s-6.300003,14 -14,14z"/>'
    + '<circle fill="' + color + '" stroke="null" r="14.031405" cy="35.000002" cx="34.999999"/>'
    + (point.orientation ? '<polygon fill="' + color + '" points="47.699997901916504,16.983383178710938 47.000000953674316,17.68338394165039 35.000000953674316,12.7833890914917 23.00000286102295,17.68338394165039 22.300002098083496,16.983383178710938 35.000000953674316,4.28338623046875" />' : '')
    + '</svg>'

  return L.icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(svg),
    iconSize: [40, 40],
  })
}

function addPoint(uuid, point) {
  var marker = L.rotatedMarker([point.coords.latitude, point.coords.longitude], {
    //zIndexOffset: (uuid === myUuid ? 1000 : 0),
    icon: createIcon(uuid, point)
  })

  markers[uuid] = marker;

  marker.options.angle = point.orientation;
  marker.addTo(map)

  map.fitBounds(Object.keys(markers).map(function(uuid) {
    return markers[uuid].getLatLng()
  }))
}

function removePoint(uuid) {
  if (markers[uuid]) {
    map.removeLayer(markers[uuid])
    //markers[uuid] = null
  }
}

function updatePoint(uuid, point) {
  // Avoid clipping effect when zooming map + updating point at the same time.
  if (mapZooming) {
    map.once('zoomend', function() {
      updatePoint(uuid, point)
    })
    return
  }

  var marker = markers[uuid]

  marker.setIcon(createIcon(uuid, point));

  marker.options.angle = point.orientation
  marker.setLatLng([point.coords.latitude, point.coords.longitude])
}

function putPoint(uuid, point) {
  if (markers[uuid]) {
    updatePoint(uuid, point)
  } else {
    addPoint(uuid, point)
  }
}


//
// Firebase
//
var endpoint;

endpoint = new Firebase('https://' + config.firebase + '.firebaseio.com/maps/' + mapId);

endpoint.on('child_added', function(childSnapshot) {
  var uuid = childSnapshot.key()
  var point = childSnapshot.val()

  if (uuid === myUuid) return

  addPoint(uuid, point)
})

endpoint.on('child_changed', function(childSnapshot) {
  var uuid = childSnapshot.key()
  var point = childSnapshot.val()

  if (uuid === myUuid) return

  putPoint(uuid, point)
})

endpoint.on('child_removed', function(oldChildSnapshot) {
  var uuid = oldChildSnapshot.key()

  removePoint(uuid)
})

//
// Tracking
//
var watchPositionId;
var currentCoords = null;
var currentOrientation = null;

function pushCurrentStatus() {
  if (!currentCoords) return

  endpoint.child(myUuid).set({
    coords: {
      latitude: currentCoords.latitude,
      longitude: currentCoords.longitude,
    },
    orientation: currentOrientation,
    timestamp: now()
  })
}
pushCurrentStatus = _.throttle(pushCurrentStatus, 50)

if (navigator.geolocation) {
  setTimeout(function() {
    watchPositionId = navigator.geolocation.watchPosition(
      successWatchPosition,
      failWatchPosition,
      {enableHighAccuracy: false}
    )
  }, 0)

  setTimeout(function() {
    navigator.geolocation.clearWatch(watchPositionId)

    watchPositionId = navigator.geolocation.watchPosition(
      successWatchPosition,
      failWatchPosition,
      {enableHighAccuracy: true}
    )
  }, 5000)
}

function successWatchPosition(position) {
  if (!position.coords) return

  currentCoords = position.coords

  pushCurrentStatus()
  putPoint(myUuid, {coords: currentCoords, orientation: currentOrientation})
}

function failWatchPosition() {
  alert('Fail to get your location')
}


if (window.DeviceOrientationEvent) {
  window.addEventListener('deviceorientation', deviceOrientationHandler, true)
}

function deviceOrientationHandler(event) {
  var alpha;

  if (event.webkitCompassHeading) {
    alpha = event.webkitCompassHeading;
  } else {
    alpha = event.alpha;
  }

  if (!alpha) return

  currentOrientation = 360 - alpha

  pushCurrentStatus()
  putPoint(myUuid, {coords: currentCoords, orientation: currentOrientation})
}


//
// Remove old markers
//
setInterval(function() {
  endpoint.limitToFirst(100).once('value', function(snap) {
    var now = Math.floor(Date.now() / 1000)

    snap.forEach(function(childSnapshot) {
      var uuid = childSnapshot.key()
      var point = childSnapshot.val()

      if (uuid === myUuid) return

      if (childSnapshot.val().timestamp < now - 60 * 30) {
        endpoint.child(uuid).set(null)
      } else {
        updatePoint(uuid, point)
      }
    })
  })
}, 5000);

})();

/* ============================================================
   ONLY HEALTH – script.js  (Fixed Version)
   Fixes: marker icons, Places API params, search filter
============================================================ */
'use strict';

/* ----------------------------------------------------------
   CONSTANTS
---------------------------------------------------------- */
const SEARCH_RADIUS = 5000; // metres around user

/* ----------------------------------------------------------
   STATE
---------------------------------------------------------- */
const state = {
  map: null,
  userLocation: null,
  currentMode: null,       // 'stores' | 'hospitals'
  markers: [],
  userMarker: null,
  userCircle: null,
  infoWindow: null,
  placesService: null,
  allResults: [],
  filteredResults: [],
  viewMode: 'split',
  watchId: null,
  darkMode: false,
};

/* ----------------------------------------------------------
   DOM HELPERS
---------------------------------------------------------- */
const $ = id => document.getElementById(id);

const DOM = {
  loadingOverlay: $('loadingOverlay'),
  navbar:         $('navbar'),
  homeSection:    $('homeSection'),
  mapSection:     $('mapSection'),
  siteFooter:     $('siteFooter'),
  navHome:        $('navHome'),
  navStores:      $('navStores'),
  navHospitals:   $('navHospitals'),
  medStoreCard:   $('medStoreCard'),
  hospitalCard:   $('hospitalCard'),
  mapSectionIcon: $('mapSectionIcon'),
  mapSectionText: $('mapSectionText'),
  backBtn:        $('backBtn'),
  mapLayout:      $('mapLayout'),
  recenterBtn:    $('recenterBtn'),
  searchInput:    $('searchInput'),
  searchClear:    $('searchClear'),
  splitViewBtn:   $('splitViewBtn'),
  mapOnlyBtn:     $('mapOnlyBtn'),
  listOnlyBtn:    $('listOnlyBtn'),
  resultsList:    $('resultsList'),
  resultsCount:   $('resultsCount'),
  themeToggle:    $('themeToggle'),
  themeIcon:      $('themeIcon'),
  hamburger:      $('hamburger'),
  navLinks:       $('navLinks'),
  errorToast:     $('errorToast'),
  toastMsg:       $('toastMsg'),
  toastClose:     $('toastClose'),
  footerYear:     $('footerYear'),
};

/* ============================================================
   INIT — called by Google Maps as async callback
============================================================ */
function initMap() {
  DOM.footerYear.textContent = new Date().getFullYear();

  // Restore theme
  const saved = localStorage.getItem('onlyhealth-theme') || 'light';
  applyTheme(saved === 'dark');

  bindEvents();
  getUserLocation();
}

/* ============================================================
   THEME
============================================================ */
function applyTheme(dark) {
  state.darkMode = dark;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  DOM.themeIcon.className = dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  localStorage.setItem('onlyhealth-theme', dark ? 'dark' : 'light');
  if (state.map) {
    state.map.setOptions({ styles: dark ? darkMapStyles() : [] });
  }
}

function darkMapStyles() {
  return [
    { elementType: 'geometry',           stylers: [{ color: '#0d2137' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0a1929' }] },
    { elementType: 'labels.text.fill',   stylers: [{ color: '#90bcd8' }] },
    { featureType: 'road', elementType: 'geometry',         stylers: [{ color: '#1e3a55' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#64b5f6' }] },
    { featureType: 'water', elementType: 'geometry',        stylers: [{ color: '#05162a' }] },
    { featureType: 'poi',   elementType: 'geometry',        stylers: [{ color: '#102a43' }] },
  ];
}

/* ============================================================
   GEOLOCATION
============================================================ */
function getUserLocation() {
  if (!navigator.geolocation) {
    hideLoading();
    showToast('Geolocation is not supported by your browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      state.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      hideLoading();
      console.log('📍 Location acquired:', state.userLocation);
    },
    err => {
      hideLoading();
      const msgs = {
        1: 'Location permission denied. Please allow access and refresh.',
        2: 'Location unavailable. Check your device settings.',
        3: 'Location request timed out. Please try again.',
      };
      showToast(msgs[err.code] || 'Could not get your location.');
      console.error('Geolocation error:', err);
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

/* ============================================================
   CREATE / INIT MAP
============================================================ */
function createMap(center) {
  state.map = new google.maps.Map(document.getElementById('map'), {
    center,
    zoom: 14,
    mapTypeId: google.maps.MapTypeId.HYBRID,   // satellite view
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: true,
    streetViewControl: false,
    fullscreenControl: true,
    styles: state.darkMode ? darkMapStyles() : [],
  });

  state.infoWindow   = new google.maps.InfoWindow();
  state.placesService = new google.maps.places.PlacesService(state.map);

  placeUserMarker(center);
}

function placeUserMarker(position) {
  // Remove old marker/circle
  if (state.userMarker) state.userMarker.setMap(null);
  if (state.userCircle) state.userCircle.setMap(null);

  // Blue dot for user
  state.userMarker = new google.maps.Marker({
    position,
    map: state.map,
    title: 'Your Location',
    zIndex: 999,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 11,
      fillColor: '#42a5f5',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 3,
    },
  });

  // Accuracy ring
  state.userCircle = new google.maps.Circle({
    map: state.map,
    center: position,
    radius: 120,
    fillColor: '#42a5f5',
    fillOpacity: 0.12,
    strokeColor: '#42a5f5',
    strokeOpacity: 0.5,
    strokeWeight: 1,
    clickable: false,
  });
}

/* ============================================================
   SHOW MAP SECTION
============================================================ */
function showMapSection(mode) {
  state.currentMode = mode;

  // Update header icon & title
  DOM.mapSectionIcon.className = mode === 'stores' ? 'fa-solid fa-pills' : 'fa-solid fa-hospital';
  DOM.mapSectionText.textContent = mode === 'stores' ? 'Medical Stores' : 'Hospitals';

  // Swap sections
  DOM.homeSection.classList.add('hidden');
  DOM.siteFooter.classList.add('hidden');
  DOM.mapSection.classList.remove('hidden');
  setActiveNav(mode === 'stores' ? DOM.navStores : DOM.navHospitals);

  // Guard: location not ready yet
  if (!state.userLocation) {
    showToast('Getting your location… please wait and try again.');
    getUserLocation();
    return;
  }

  // Reset search
  DOM.searchInput.value = '';
  DOM.searchClear.classList.add('hidden');

  // Build or reuse map
  if (!state.map) {
    createMap(state.userLocation);
  } else {
    state.map.setCenter(state.userLocation);
    state.map.setZoom(14);
    placeUserMarker(state.userLocation);
  }

  clearMarkers();
  clearResultsList();
  searchNearby(mode);
}

/* ============================================================
   PLACES NEARBY SEARCH  (Fixed)
============================================================ */
function searchNearby(mode) {
  DOM.resultsCount.textContent = 'Searching…';

  const typeMap = {
    stores:    'pharmacy',
    hospitals: 'hospital',
  };

  const request = {
    location: new google.maps.LatLng(state.userLocation.lat, state.userLocation.lng),
    radius: SEARCH_RADIUS,
    type: typeMap[mode],           // single type string — correct for nearbySearch
  };

  console.log('🔍 Places request:', request);

  state.placesService.nearbySearch(request, (results, status) => {
    console.log('Places status:', status, '| Results:', results);

    if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
      state.allResults      = results;
      state.filteredResults = results;
      DOM.resultsCount.textContent = results.length;
      renderMarkers(results);
      renderResults(results);
    } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
      DOM.resultsCount.textContent = '0';
      showNoResults('No places found nearby. Try a different location.');
    } else {
      DOM.resultsCount.textContent = '0';
      console.error('Places API error:', status);
      showNoResults(`API error: ${status}. Check your API key and billing.`);
      showToast(`Places API: ${status}. Ensure Places API is enabled in Google Cloud.`);
    }
  });
}

/* ============================================================
   MARKERS  (Fixed — no chart.googleapis.com)
============================================================ */
function renderMarkers(places) {
  clearMarkers();

  const isStore = state.currentMode === 'stores';

  places.forEach((place, idx) => {
    if (!place.geometry || !place.geometry.location) return;

    // Custom SVG pin — green for stores, blue for hospitals
    const pinColor = isStore ? '#00897b' : '#1565c0';
    const svgMarker = {
      path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z' +
            'M12 11.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z',
      fillColor: pinColor,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 1.5,
      scale: 1.8,
      anchor: new google.maps.Point(12, 22),
      labelOrigin: new google.maps.Point(12, 9),
    };

    const marker = new google.maps.Marker({
      position: place.geometry.location,
      map: state.map,
      title: place.name,
      icon: svgMarker,
      label: {
        text: String(idx + 1),
        color: '#ffffff',
        fontSize: '10px',
        fontWeight: 'bold',
      },
      animation: google.maps.Animation.DROP,
    });

    marker.addListener('click', () => {
      openInfoWindow(marker, place);
      highlightCard(idx);
    });

    state.markers.push(marker);
  });
}

/* ============================================================
   INFO WINDOW
============================================================ */
function openInfoWindow(marker, place) {
  const rating = place.rating ? `⭐ ${place.rating} / 5` : 'No rating';
  const openNow = place.opening_hours?.open_now;
  const statusHtml = openNow === true
    ? '<span style="color:#2e7d32;font-weight:700">● Open Now</span>'
    : openNow === false
      ? '<span style="color:#c62828;font-weight:700">● Closed</span>'
      : '<span style="color:#888">Status unknown</span>';

  const mapsUrl = `https://www.google.com/maps/place/?q=place_id:${place.place_id}`;

  const content = `
    <div style="font-family:Inter,sans-serif;padding:6px 4px;max-width:250px;line-height:1.5">
      <h3 style="margin:0 0 6px;font-size:.98rem;font-weight:700;color:#0d1b2a">${place.name}</h3>
      <p style="margin:0 0 4px;font-size:.82rem;color:#3a5068">
        📍 ${place.vicinity || 'Address not available'}
      </p>
      <p style="margin:0 0 4px;font-size:.82rem">${rating}</p>
      <p style="margin:0 0 8px;font-size:.82rem">${statusHtml}</p>
      <a href="${mapsUrl}" target="_blank" rel="noopener"
         style="font-size:.82rem;color:#1565c0;font-weight:600;text-decoration:none">
        Open in Google Maps →
      </a>
    </div>`;

  state.infoWindow.setContent(content);
  state.infoWindow.open(state.map, marker);
  state.map.panTo(marker.getPosition());
}

/* ============================================================
   RESULTS LIST
============================================================ */
function renderResults(places) {
  DOM.resultsList.innerHTML = '';

  if (!places || places.length === 0) {
    showNoResults();
    return;
  }

  places.forEach((place, idx) => {
    const openNow   = place.opening_hours?.open_now;
    const badgeCls  = openNow === true ? 'badge-open' : openNow === false ? 'badge-closed' : '';
    const badgeTxt  = openNow === true ? 'Open' : openNow === false ? 'Closed' : '';

    // Distance from user (straight line)
    let distHtml = '';
    if (state.userLocation && place.geometry?.location) {
      const d = getDistanceKm(
        state.userLocation,
        { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() }
      );
      distHtml = `<span class="rc-dist"><i class="fa-solid fa-route"></i> ${d} km</span>`;
    }

    const li = document.createElement('li');
    li.className   = 'result-card';
    li.dataset.idx  = idx;
    li.dataset.name = (place.name || '').toLowerCase();

    li.innerHTML = `
      <div class="rc-top">
        <span class="rc-name">${idx + 1}. ${place.name}</span>
        ${badgeTxt ? `<span class="rc-badge ${badgeCls}">${badgeTxt}</span>` : ''}
      </div>
      <p class="rc-addr">
        <i class="fa-solid fa-location-dot"></i>
        ${place.vicinity || 'Address not available'}
      </p>
      <div class="rc-meta">
        ${place.rating
          ? `<span class="rc-rating"><i class="fa-solid fa-star"></i> ${place.rating}</span>`
          : ''}
        ${distHtml}
      </div>`;

    li.addEventListener('click', () => {
      if (state.markers[idx]) {
        openInfoWindow(state.markers[idx], place);
        highlightCard(idx);
      }
      // On small screens, auto-switch to map
      if (window.innerWidth <= 900) switchView('map');
    });

    DOM.resultsList.appendChild(li);
  });
}

function showNoResults(msg = 'No results found nearby.') {
  DOM.resultsList.innerHTML = `
    <li class="no-results">
      <i class="fa-solid fa-circle-xmark"></i>
      <p>${msg}</p>
    </li>`;
}

function clearResultsList() {
  DOM.resultsList.innerHTML = '';
  DOM.resultsCount.textContent = '—';
}

/* ============================================================
   SEARCH / FILTER  (Fixed)
============================================================ */
function filterResults(query) {
  const q = query.trim().toLowerCase();
  DOM.searchClear.classList.toggle('hidden', q === '');

  if (!q) {
    state.filteredResults = state.allResults;
  } else {
    state.filteredResults = state.allResults.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.vicinity && p.vicinity.toLowerCase().includes(q))
    );
  }

  DOM.resultsCount.textContent = state.filteredResults.length;

  // Re-render list with filtered slice
  renderResults(state.filteredResults);

  // Show/hide markers: match by place_id
  const visibleIds = new Set(state.filteredResults.map(p => p.place_id));
  state.markers.forEach((marker, idx) => {
    const place = state.allResults[idx];
    marker.setVisible(!q || (place && visibleIds.has(place.place_id)));
  });
}

/* ============================================================
   VIEW MODES
============================================================ */
function switchView(mode) {
  state.viewMode = mode;
  DOM.mapLayout.classList.remove('map-only', 'list-only');
  [DOM.splitViewBtn, DOM.mapOnlyBtn, DOM.listOnlyBtn].forEach(b => b.classList.remove('active'));

  if (mode === 'map') {
    DOM.mapLayout.classList.add('map-only');
    DOM.mapOnlyBtn.classList.add('active');
  } else if (mode === 'list') {
    DOM.mapLayout.classList.add('list-only');
    DOM.listOnlyBtn.classList.add('active');
  } else {
    DOM.splitViewBtn.classList.add('active');
  }

  // Force map redraw after layout change
  setTimeout(() => {
    if (state.map) google.maps.event.trigger(state.map, 'resize');
  }, 200);
}

/* ============================================================
   HIGHLIGHT CARD
============================================================ */
function highlightCard(idx) {
  document.querySelectorAll('.result-card').forEach(c => c.classList.remove('highlighted'));
  const card = document.querySelector(`.result-card[data-idx="${idx}"]`);
  if (card) {
    card.classList.add('highlighted');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/* ============================================================
   CLEAR MARKERS
============================================================ */
function clearMarkers() {
  state.markers.forEach(m => m.setMap(null));
  state.markers = [];
  if (state.infoWindow) state.infoWindow.close();
}

/* ============================================================
   DISTANCE (Haversine)
============================================================ */
function getDistanceKm(a, b) {
  const R    = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
    Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return (R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))).toFixed(1);
}

/* ============================================================
   TOAST
============================================================ */
let _toastTimer = null;
function showToast(msg, ms = 6000) {
  DOM.toastMsg.textContent = msg;
  DOM.errorToast.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(hideToast, ms);
}
function hideToast() { DOM.errorToast.classList.add('hidden'); }

/* ============================================================
   LOADING OVERLAY
============================================================ */
function hideLoading() {
  DOM.loadingOverlay.classList.add('fade-out');
  setTimeout(() => DOM.loadingOverlay.classList.add('hidden'), 500);
}

/* ============================================================
   NAVIGATION HELPERS
============================================================ */
function setActiveNav(link) {
  [DOM.navHome, DOM.navStores, DOM.navHospitals].forEach(l => l.classList.remove('active'));
  link.classList.add('active');
}

function goHome() {
  DOM.mapSection.classList.add('hidden');
  DOM.homeSection.classList.remove('hidden');
  DOM.siteFooter.classList.remove('hidden');
  setActiveNav(DOM.navHome);
  state.currentMode = null;
  DOM.searchInput.value = '';
  DOM.searchClear.classList.add('hidden');
}

/* ============================================================
   BIND ALL EVENTS
============================================================ */
function bindEvents() {
  // Dashboard cards
  DOM.medStoreCard.addEventListener('click', () => showMapSection('stores'));
  DOM.medStoreCard.addEventListener('keydown', e => e.key === 'Enter' && showMapSection('stores'));
  DOM.hospitalCard.addEventListener('click', () => showMapSection('hospitals'));
  DOM.hospitalCard.addEventListener('keydown', e => e.key === 'Enter' && showMapSection('hospitals'));

  // Nav links
  DOM.navHome.addEventListener('click',      e => { e.preventDefault(); goHome(); });
  DOM.navStores.addEventListener('click',    e => { e.preventDefault(); showMapSection('stores'); });
  DOM.navHospitals.addEventListener('click', e => { e.preventDefault(); showMapSection('hospitals'); });
  $('homeBtn').addEventListener('click',     e => { e.preventDefault(); goHome(); });

  // Back button
  DOM.backBtn.addEventListener('click', goHome);

  // Recenter
  DOM.recenterBtn.addEventListener('click', () => {
    if (state.map && state.userLocation) {
      state.map.panTo(state.userLocation);
      state.map.setZoom(14);
    } else {
      showToast('Location not available yet.');
    }
  });

  // Search
  DOM.searchInput.addEventListener('input', e => filterResults(e.target.value));
  DOM.searchClear.addEventListener('click', () => {
    DOM.searchInput.value = '';
    filterResults('');
    DOM.searchInput.focus();
  });

  // View toggles
  DOM.splitViewBtn.addEventListener('click', () => switchView('split'));
  DOM.mapOnlyBtn.addEventListener('click',   () => switchView('map'));
  DOM.listOnlyBtn.addEventListener('click',  () => switchView('list'));

  // Theme
  DOM.themeToggle.addEventListener('click', () => applyTheme(!state.darkMode));

  // Hamburger (mobile)
  DOM.hamburger.addEventListener('click', () => DOM.navLinks.classList.toggle('open'));
  document.querySelectorAll('.nav-link').forEach(l =>
    l.addEventListener('click', () => DOM.navLinks.classList.remove('open'))
  );

  // Toast close
  DOM.toastClose.addEventListener('click', hideToast);

  // Navbar shadow on scroll
  window.addEventListener('scroll', () => {
    DOM.navbar.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
}

/* ============================================================
   EXPOSE global callback for Google Maps
============================================================ */
window.initMap = initMap;

const destinations = [
  {
    id: 'mulliri',
    name: 'Mulliri',
    image: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=600&q=80',
    description: 'Popular coffee hub in Tirana, perfect for remote working, fresh pastries, and social meetups.',
    locationUrl: 'https://maps.google.com/?q=Mulliri+Tirane+Albania',
    minAge: 16,
    maxAge: 60,
    activeCount: 22,
    totalBookings: 310,
    liveAgeBreakdown: { '16-24': 10, '25-35': 8, '36+': 4 },
    hasLocationsDropdown: true
  },
  {
    id: 'moncherie',
    name: 'Moncherie',
    image: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=600&q=80',
    description: 'Cozy, vibrant espresso bar franchise loved by students and young professionals across Tirana.',
    locationUrl: 'https://maps.google.com/?q=MonCherie+Tirane+Albania',
    minAge: 18,
    maxAge: 35,
    activeCount: 18,
    totalBookings: 245,
    liveAgeBreakdown: { '18-22': 9, '23-28': 6, '29-35': 3 },
    hasLocationsDropdown: true
  },
  {
    id: 'sophie',
    name: 'Sophie',
    image: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=600&q=80',
    description: 'Charming lounge bar and caffe offer sweet treats and vibrant social atmospheres.',
    locationUrl: 'https://maps.google.com/?q=Sophie+Caffe+Tirane+Albania',
    minAge: 18,
    maxAge: 45,
    activeCount: 15,
    totalBookings: 189,
    liveAgeBreakdown: { '18-25': 7, '26-35': 5, '36-45': 3 },
    hasLocationsDropdown: true
  },
  {
    id: 'le-cheateau',
    name: 'Le Chateau',
    image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=600&q=80',
    description: 'Elegant lounge environment featuring fine drinks, signature cocktails, and relaxed vibes.',
    locationUrl: 'https://maps.google.com/?q=Le+Chateau+Tirane+Albania',
    minAge: 21,
    maxAge: 65,
    activeCount: 27,
    totalBookings: 412,
    liveAgeBreakdown: { '21-30': 12, '31-45': 10, '46+': 5 },
    hasLocationsDropdown: false
  },
  {
    id: 'millenium-garden',
    name: 'Millenium Garden',
    image: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2f/3f/36/d5/caption.jpg?w=900&h=-1&s=1',
    description: 'Spacious outdoor terrace garden bar along Pedonalja, ideal for large gatherings.',
    locationUrl: 'https://maps.google.com/?q=Millennium+Garden+Tirane+Albania',
    minAge: 18,
    maxAge: 70,
    activeCount: 34,
    totalBookings: 520,
    liveAgeBreakdown: { '18-25': 14, '26-40': 12, '41+': 8 },
    hasLocationsDropdown: false
  },
  {
    id: 'my-way',
    name: 'My Way - Liqeni Artificial Tirane',
    image: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=600&q=80',
    description: 'Scenic bar right by Tirana Artificial Lake, offering panoramic water views and great cocktails.',
    locationUrl: 'https://maps.google.com/?q=My+Way+Liqeni+Artificial+Tirane+Albania',
    minAge: 20,
    maxAge: 50,
    activeCount: 31,
    totalBookings: 380,
    liveAgeBreakdown: { '20-29': 15, '30-40': 11, '41-50': 5 },
    hasLocationsDropdown: false
  },
  {
    id: 'komiteti',
    name: 'Komiteti',
    image: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=600&q=80',
    description: 'Famous Kafe-Muzeum known for vintage Albanian culture, traditional raki, and artistic community.',
    locationUrl: 'https://maps.google.com/?q=Komiteti+Kafe+Muzeum+Tirane+Albania',
    minAge: 21,
    maxAge: 55,
    activeCount: 25,
    totalBookings: 298,
    liveAgeBreakdown: { '21-28': 11, '29-40': 9, '41-55': 5 },
    hasLocationsDropdown: false
  }
];

const barLocationsList = [
  'bllok',
  'drejtoria e policise',
  'sheshi wilson',
  'blv bajram curri',
  'rruga jan kukuzeli',
  'rruga sami frasheri',
  'rruga medar shtylla',
  'zogu i zi',
  'rruga muhamet gjollesha',
  'rruga e kavajes',
  'toptani',
  'rruga e elbasanit',
  'rruga e durresit',
  'rruga e barikadave',
  'don bosco',
  'ali demi',
  'rruga hoxha tasim',
  'kombinat'
];

const STORAGE_KEY = 'socialCircleUser';
const FAVORITES_KEY = 'socialCircleFavorites';
const REVIEWS_KEY = 'socialCircleReviews';
const THEME_KEY = 'socialCircleTheme';
const ACTIVITY_KEY = 'socialCircleActivity';

const currentUser = {
  userId: 'USR-1003',
  email: '',
  password: '',
  ageRange: '',
  bookingPlace: 'None',
  bookingDate: 'N/A',
  bookingTime: 'N/A',
  bookings: [],
  favorites: [],
  createdAt: new Date().toISOString()
};

let userChatCount = 0;
let selectedPlace = null;
let lastViewedVenue = null;

// Use the deployed origin in production; localhost only exists on a developer's machine.
const USER_DATA_API_URL = '/api/user';

function sanitizeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeHTML(str) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return String(str).replace(/[&<>"']/g, (char) => map[char]);
}

/* Toast Notifications */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/* Dark Mode */
function initDarkMode() {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
  }
}

function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  showToast(isDark ? '🌙 Dark mode enabled' : '☀️ Light mode enabled');
}

/* Mobile Menu */
function setupMobileMenu() {
  const hamburger = document.getElementById('hamburger-menu');
  const navLinks = document.querySelector('.nav-links');
  if (!hamburger || !navLinks) return;

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('active');
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      navLinks.classList.remove('active');
    });
  });
}

/* Favorites Management */
function toggleFavorite(venueId) {
  if (!currentUser.favorites) currentUser.favorites = [];
  const idx = currentUser.favorites.indexOf(venueId);
  if (idx > -1) {
    currentUser.favorites.splice(idx, 1);
  } else {
    currentUser.favorites.push(venueId);
  }
  saveUserState();
  updateFavoriteButtons();
  showToast(idx > -1 ? 'Removed from favorites' : 'Added to favorites', 'success');
}

function updateFavoriteButtons() {
  document.querySelectorAll('.favorite-btn').forEach(btn => {
    const venueId = btn.dataset.venue;
    const isFavorite = currentUser.favorites && currentUser.favorites.includes(venueId);
    btn.classList.toggle('active', isFavorite);
    btn.textContent = isFavorite ? '★' : '☆';
  });
}

/* Search & Filter */
function filterVenues(searchTerm) {
  const term = searchTerm.toLowerCase().trim();
  return term ? destinations.filter(v =>
    v.name.toLowerCase().includes(term) ||
    v.description.toLowerCase().includes(term)
  ) : destinations;
}

/* Password Strength */
function calculatePasswordStrength(password) {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;
  return strength >= 4 ? 'strong' : strength >= 2 ? 'good' : 'fair';
}

const STRENGTH_PERCENT = { fair: 33, good: 66, strong: 100 };

/* Updates a strength bar (inner fill) and the aria state on its .strength-meter track */
function updateStrengthBar(barId, password) {
  const strengthBar = document.getElementById(barId);
  if (!strengthBar) return null;
  const strength = password ? calculatePasswordStrength(password) : '';
  strengthBar.className = strength ? `strength-bar ${strength}` : 'strength-bar';
  const meter = strengthBar.closest('.strength-meter');
  if (meter) meter.setAttribute('aria-valuenow', String(STRENGTH_PERCENT[strength] || 0));
  return strength;
}

function showPasswordStrength(password) {
  const strengthBar = document.getElementById('password-strength-bar');
  if (!strengthBar) return;
  updateStrengthBar('password-strength-bar', password);
  const errorDiv = document.getElementById('registration-password-error');
  if (errorDiv) {
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
  }
}

/* Venue Reviews */
function addVenueReview(venueId, rating, comment) {
  if (!currentUser.reviews) currentUser.reviews = [];
  const review = {
    venueId,
    rating: parseInt(rating),
    comment: comment.trim(),
    author: currentUser.email || 'Anonymous',
    date: new Date().toLocaleDateString()
  };
  currentUser.reviews.push(review);
  saveUserState();
  showToast('Review posted! ⭐', 'success');
}

function getVenueReviews(venueId) {
  return (currentUser.reviews || []).filter(r => r.venueId === venueId);
}

/* Stats Dashboard */
function getStats() {
  return {
    totalBookings: (currentUser.bookings || []).length,
    totalFavorites: (currentUser.favorites || []).length,
    memberSince: currentUser.createdAt ? new Date(currentUser.createdAt).toLocaleDateString() : 'Today',
    totalReviews: (currentUser.reviews || []).length
  };
}

/* Activity Logging */
function logActivity(action) {
  if (!currentUser.activity) currentUser.activity = [];
  currentUser.activity.push({
    action,
    timestamp: new Date().toISOString()
  });
  if (currentUser.activity.length > 50) currentUser.activity.shift();
  saveUserState();
}

/* Data Export */
function exportUserData() {
  const dataStr = JSON.stringify(currentUser, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `social-circle-data-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('Data exported! 📥', 'success');
}

async function loadUserState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(currentUser, parsed);
      return;
    }
  } catch (error) {
    console.warn('Could not load saved user state:', error);
  }
}

async function saveUserState() {
  const hasProfileData = Boolean(currentUser.email || currentUser.password || currentUser.ageRange);

  try {
    if (!hasProfileData) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const { password, ...safeData } = currentUser;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeData));
  } catch (error) {
    console.warn('Could not save user state:', error);
  }
}

function hasRegisteredUser() {
  // First check if currentUser has email (from server or localStorage)
  if (currentUser.email) {
    return Boolean(currentUser.email);
  }

  // Then check localStorage as fallback
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return false;

  try {
    const parsed = JSON.parse(saved);
    return Boolean(parsed && parsed.email);
  } catch (error) {
    return false;
  }
}

function setupNavigationState() {
  const pathname = window.location.pathname.split('/').pop() || 'index.html';
  const pageName = pathname === 'index.html' ? 'index' : pathname.replace('.html', '');
  document.querySelectorAll('.nav-links a').forEach((link) => {
    const target = link.dataset.page;
    link.classList.toggle('active', target === pageName || (pageName === 'index' && target === 'index'));
  });
}

function createCardHTML(place, showActions) {
  let selectHTML = '';
  if (place.hasLocationsDropdown) {
    selectHTML = `
      <div style="margin-bottom: 0.75rem;">
        <label style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 0.2rem;">Select Specific Location:</label>
        <select id="card-select-${place.id}" style="width: 100%; padding: 0.4rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">
          ${barLocationsList.map(loc => `<option value="${loc}">${loc}</option>`).join('')}
        </select>
      </div>
    `;
  }

  const isFavorite = currentUser.favorites && currentUser.favorites.includes(place.id);
  const favoriteBtn = `<button class="favorite-btn" data-venue="${place.id}" onclick="event.stopPropagation(); toggleFavorite('${place.id}')" style="position:absolute;top:1rem;right:1rem;background:rgba(255,255,255,0.9);border-radius:50%;width:40px;height:40px;border:none;cursor:pointer;font-size:1.5rem;">${isFavorite ? '★' : '☆'}</button>`;

  return `
    <div class="card" style="position:relative;">
      ${favoriteBtn}
      <img src="${place.image}" alt="${escapeHTML(place.name)}">
      <div class="card-body">
        <div class="live-counter">
          <span class="pulse"></span>
          <span id="counter-${place.id}">${place.activeCount}</span> people here now
        </div>
        <h3 class="card-title">${escapeHTML(place.name)}</h3>
        <p class="card-text">${escapeHTML(place.description)}</p>
        ${selectHTML}
        <div class="badge-age">Allowed Age Range: <strong>${place.minAge} - ${place.maxAge} years</strong></div>
        <a href="${place.locationUrl}" target="_blank" rel="noopener noreferrer" class="map-link">📍 Google Maps Location</a>
        <a class="btn-primary" href="detail.html?id=${place.id}" onclick="lastViewedVenue='${place.id}'">${showActions ? 'Book Here' : 'View Place'}</a>
      </div>
    </div>
  `;
}

function renderFilteredVenues(venues) {
  const container = document.getElementById('booking-grid');
  if (!container) return;
  container.innerHTML = venues.map(place => createCardHTML(place, true)).join('');
  updateFavoriteButtons();
}

function renderFeaturedHome() {
  const container = document.getElementById('home-featured-grid');
  if (!container) return;
  container.innerHTML = destinations.slice(0, 3).map(place => createCardHTML(place, false)).join('');
  updateFavoriteButtons();
}

function renderBookingList() {
  const container = document.getElementById('booking-grid');
  if (!container) return;
  container.innerHTML = destinations.map(place => createCardHTML(place, true)).join('');
  updateFavoriteButtons();
}

function loadDetailPageFromQuery() {
  const detailHeader = document.getElementById('detail-header');
  if (!detailHeader) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') || 'mulliri';
  selectedPlace = destinations.find((place) => place.id === id) || destinations[0];

  const bookingError = document.getElementById('booking-error');
  if (bookingError) bookingError.style.display = 'none';

  const locationContainer = document.getElementById('location-select-container');
  const locationSelect = document.getElementById('booking-location');
  if (selectedPlace.hasLocationsDropdown) {
    if (locationContainer) locationContainer.style.display = 'block';
    if (locationSelect) {
      locationSelect.innerHTML = barLocationsList.map((loc) => `<option value="${loc}">${loc}</option>`).join('');
    }
  } else if (locationContainer) {
    locationContainer.style.display = 'none';
  }

  let ageBreakdownHtml = '';
  for (const [range, count] of Object.entries(selectedPlace.liveAgeBreakdown)) {
    ageBreakdownHtml += `
      <div class="stat-box">
        <div class="number" id="age-breakdown-${range}">${count}</div>
        <div class="label">Age ${range} Joined</div>
      </div>
    `;
  }

  detailHeader.innerHTML = `
    <h1>${escapeHTML(selectedPlace.name)}</h1>
    <p style="color: var(--text-muted); margin-top: 0.5rem;">${escapeHTML(selectedPlace.description)}</p>
    <a href="${selectedPlace.locationUrl}" target="_blank" rel="noopener noreferrer" class="map-link" style="margin-top:0.5rem;">📍 Open in Google Maps</a>
    <h4 style="margin-top: 1.5rem;">Online Live Age Counter for ${escapeHTML(selectedPlace.name)}:</h4>
    <div class="stats-grid">
      <div class="stat-box">
        <div class="number" id="detail-active-count">${selectedPlace.activeCount}</div>
        <div class="label">Total Live Guests</div>
      </div>
      ${ageBreakdownHtml}
      <div class="stat-box">
        <div class="number">${selectedPlace.minAge} - ${selectedPlace.maxAge}</div>
        <div class="label">Required Age Range</div>
      </div>
    </div>
  `;

  const otherPlaces = document.getElementById('detail-other-places-grid');
  if (otherPlaces) {
    otherPlaces.innerHTML = destinations
      .filter((place) => place.id !== selectedPlace.id)
      .map((place) => createCardHTML(place, true)).join('');
  }
}

function parseAgeBucket(value) {
  if (!value) return 18;
  if (value.endsWith('+')) return Number(value.replace('+', ''));
  const match = value.match(/(\d+)-(\d+)/);
  if (match) return Number(match[1]);
  return Number(value) || 18;
}

async function handleInitialRegistration(event) {
  event.preventDefault();
  console.log('Registration form submitted');
  const email = document.getElementById('initial-email').value;
  const password = document.getElementById('initial-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  const ageRange = document.getElementById('initial-age-range').value;
  const emailError = document.getElementById('registration-email-error');
  const passwordError = document.getElementById('registration-password-error');

  let hasError = false;

  if (email.length < 6) {
    if (emailError) { emailError.textContent = 'Email must be at least 6 characters'; emailError.style.display = 'block'; }
    hasError = true;
  } else if (!email.includes('@')) {
    if (emailError) { emailError.textContent = 'Please enter a valid email'; emailError.style.display = 'block'; }
    hasError = true;
  } else {
    if (emailError) emailError.style.display = 'none';
  }

  if (password.length < 6) {
    if (passwordError) { passwordError.textContent = 'Password must be at least 6 characters'; passwordError.style.display = 'block'; }
    hasError = true;
  } else if (password !== confirmPassword) {
    if (passwordError) { passwordError.textContent = 'Passwords do not match'; passwordError.style.display = 'block'; }
    hasError = true;
  } else {
    if (passwordError) passwordError.style.display = 'none';
  }

  if (hasError) {
    console.log('Validation failed');
    return;
  }

  const submitBtn = event.submitter || event.target.querySelector('button[type="submit"]');
  const originalLabel = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner" style="margin-right:0.5rem;"></span>Creating...';
  }

  try {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', email, password, ageRange }),
    });
    const result = await response.json();

    if (!response.ok) {
      if (passwordError) {
        passwordError.textContent = result.error || 'Could not create account.';
        passwordError.style.display = 'block';
      }
      return;
    }

    applyAuthenticatedUser(result.user, { email, password });
    showWelcomeNotification();
  } catch (error) {
    console.log('[v0] Registration request failed:', error);
    if (passwordError) {
      passwordError.textContent = 'Network error. Please try again.';
      passwordError.style.display = 'block';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalLabel;
    }
  }
}

/* Toggle between Login and Register views in the welcome modal */
function switchAuthMode(mode) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('initial-registration-form');
  const loginTab = document.getElementById('auth-tab-login');
  const registerTab = document.getElementById('auth-tab-register');
  const isLogin = mode !== 'register';

  if (loginForm) loginForm.style.display = isLogin ? 'block' : 'none';
  if (registerForm) registerForm.style.display = isLogin ? 'none' : 'block';
  if (loginTab) {
    loginTab.classList.toggle('active', isLogin);
    loginTab.setAttribute('aria-selected', String(isLogin));
  }
  if (registerTab) {
    registerTab.classList.toggle('active', !isLogin);
    registerTab.setAttribute('aria-selected', String(!isLogin));
  }
}

/* Log in an existing Supabase user */
async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const loginError = document.getElementById('login-error');

  if (loginError) loginError.style.display = 'none';

  if (!email || !password) {
    if (loginError) {
      loginError.textContent = 'Please enter your email and password.';
      loginError.style.display = 'block';
    }
    return;
  }

  const submitBtn = event.submitter || event.target.querySelector('button[type="submit"]');
  const originalLabel = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner" style="margin-right:0.5rem;"></span>Logging in...';
  }

  try {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password }),
    });
    const result = await response.json();

    if (!response.ok) {
      if (loginError) {
        loginError.textContent = result.error || 'Invalid email or password.';
        loginError.style.display = 'block';
      }
      return;
    }

    applyAuthenticatedUser(result.user, { email, password });

    if (result.user && result.user.isAdmin) {
      showToast('Welcome back, admin!', 'success');
      setTimeout(() => {
        window.location.href = 'admin.html';
      }, 800);
    }
  } catch (error) {
    console.log('[v0] Login request failed:', error);
    if (loginError) {
      loginError.textContent = 'Network error. Please try again.';
      loginError.style.display = 'block';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalLabel;
    }
  }
}

/* Shared: persist the authenticated user and close the welcome modal */
function applyAuthenticatedUser(user, credentials) {
  currentUser.email = (user && user.email) || credentials.email;
  currentUser.password = credentials.password;
  currentUser.ageRange = (user && user.ageRange) || currentUser.ageRange || '';
  currentUser.isAdmin = Boolean(user && user.isAdmin);
  currentUser.userId = currentUser.userId || 'USR-1003';
  if (!currentUser.bookings) currentUser.bookings = [];
  saveUserState();

  const welcomeModal = document.getElementById('welcome-modal');
  if (welcomeModal) {
    welcomeModal.style.display = 'none';
    const registerForm = document.getElementById('initial-registration-form');
    if (registerForm) registerForm.reset();
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.reset();
  }
  updateAccountUI();
}

function updateAccountUI() {
  saveUserState();

  const stats = getStats();
  const statBookings = document.getElementById('stat-bookings');
  const statFavorites = document.getElementById('stat-favorites');
  const statMember = document.getElementById('stat-member');
  const statReviews = document.getElementById('stat-reviews');

  if (statBookings) statBookings.textContent = stats.totalBookings;
  if (statFavorites) statFavorites.textContent = stats.totalFavorites;
  if (statMember) statMember.textContent = stats.memberSince;
  if (statReviews) statReviews.textContent = stats.totalReviews;

  const userId = document.getElementById('display-user-id');
  const email = document.getElementById('display-user-email');
  const password = document.getElementById('display-user-password');
  const age = document.getElementById('display-user-age');
  const bookingPlace = document.getElementById('display-user-booking');
  const bookingDate = document.getElementById('display-user-date');
  const bookingTime = document.getElementById('display-user-time');

  if (userId) userId.textContent = currentUser.userId;
  if (email) email.textContent = currentUser.email || 'Not Registered';
  if (password) password.textContent = currentUser.password ? '••••••••' : '••••••••';
  if (age) age.textContent = currentUser.ageRange || 'Not Specified';
  if (bookingPlace) bookingPlace.textContent = currentUser.bookingPlace || 'None';
  if (bookingDate) bookingDate.textContent = currentUser.bookingDate || 'N/A';
  if (bookingTime) bookingTime.textContent = currentUser.bookingTime || 'N/A';

  const userEmailInput = document.getElementById('user-email');
  const userPasswordInput = document.getElementById('user-password');
  if (userEmailInput) userEmailInput.value = currentUser.email || '';
  if (userPasswordInput) userPasswordInput.value = currentUser.password || '';

  renderBookingHistory();
}

function showWelcomeNotification() {
  const notification = document.createElement('div');
  notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#4CAF50;color:white;padding:1rem 1.5rem;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:9999;animation:slideIn 0.3s ease-out';
  notification.innerHTML = '✅ Welcome! Account created successfully.';
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

function handleLogout() {
  const logoutBtn = document.getElementById('logout-btn');
  if (!confirm('Are you sure you want to logout?')) return;

  if (logoutBtn) {
    logoutBtn.disabled = true;
    logoutBtn.innerHTML = '<span class="spinner" style="margin-right:0.5rem;"></span>Logging out...';
  }

  currentUser.email = '';
  currentUser.password = '';
  currentUser.ageRange = '';
  currentUser.bookingPlace = 'None';
  currentUser.bookingDate = 'N/A';
  currentUser.bookingTime = 'N/A';
  currentUser.bookings = [];
  currentUser.favorites = [];
  currentUser.reviews = [];
  currentUser.activity = [];
  saveUserState();
  logActivity('logout');

  showToast('👋 Logged out successfully!', 'success');
  setTimeout(() => {
    window.location.href = 'index.html';
  }, 1500);
}

function renderBookingHistory() {
  const historyContainer = document.getElementById('booking-history');
  if (!historyContainer) return;

  if (!currentUser.bookings || currentUser.bookings.length === 0) {
    historyContainer.innerHTML = '<p style="color:var(--text-muted);">No bookings yet. Go to Bookings to make one!</p>';
    return;
  }

  historyContainer.innerHTML = '<div style="margin-top:1rem;">' + currentUser.bookings.map((booking, idx) => `
    <div style="background:var(--bg);padding:0.75rem;border-radius:6px;margin-bottom:0.5rem;border-left:4px solid var(--primary);">
      <strong>${escapeHTML(booking.place)}</strong><br>
      <small style="color:var(--text-muted);">📅 ${escapeHTML(booking.date)} at ${escapeHTML(booking.time)}</small>
    </div>
  `).join('') + '</div>';
}

function handleProfileEdit(event) {
  event.preventDefault();

  const emailInput = document.getElementById('user-email');
  const passwordInput = document.getElementById('user-password');
  const confirmPasswordInput = document.getElementById('profile-confirm-password');

  if (!emailInput || !passwordInput) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value.trim() : password;

  if (!email || !password) {
    showToast('Please enter both email and password.', 'error');
    return;
  }

  if (email.length < 6 || email.length > 26) {
    showToast('Email must be between 6 and 26 characters.', 'error');
    return;
  }

  if (password.length < 6) {
    showToast('Password must be at least 6 characters long.', 'error');
    return;
  }

  if (confirmPassword && password !== confirmPassword) {
    showToast('Passwords do not match.', 'error');
    return;
  }

  currentUser.email = email;
  currentUser.password = password;
  saveUserState();
  updateAccountUI();
  logActivity('profile_updated');
  showToast('✅ Profile updated successfully!', 'success');
}

function togglePaymentDetails(val) {
  const cardFields = document.getElementById('card-fields');
  const bankFields = document.getElementById('bank-fields');
  const stripeFields = document.getElementById('stripe-fields');
  const cryptoFields = document.getElementById('crypto-fields');
  const cryptoDisplay = document.getElementById('crypto-address-display');

  if (cardFields) cardFields.style.display = 'none';
  if (bankFields) bankFields.style.display = 'none';
  if (stripeFields) stripeFields.style.display = 'none';
  if (cryptoFields) cryptoFields.style.display = 'none';

  if (val === 'card' && cardFields) {
    cardFields.style.display = 'block';
  } else if (val === 'stripe' && stripeFields) {
    stripeFields.style.display = 'block';
  } else if (val === 'bank' && bankFields) {
    bankFields.style.display = 'block';
  } else if (val === 'bitcoin' && cryptoFields) {
    cryptoFields.style.display = 'block';
    cryptoDisplay.textContent = 'BTC Address: bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
  } else if (val === 'crypto' && cryptoFields) {
    cryptoFields.style.display = 'block';
    cryptoDisplay.textContent = 'Multi-Crypto Wallet (ETH/USDT/USDC/SOL/BNB): 0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
  } else if (val === 'paypal' && cryptoFields) {
    cryptoFields.style.display = 'block';
    cryptoDisplay.textContent = 'PayPal Redirect / Address: donations@socialcircle.al';
  } else if ((val === 'wallets' || val === 'online') && cryptoFields) {
    cryptoFields.style.display = 'block';
    cryptoDisplay.textContent = 'Payment Gateway Link will open automatically upon submitting.';
  }
}

function copyBankDetails() {
  const bankBox = document.getElementById('bank-details-display');
  if (!bankBox) return;

  const text = bankBox.innerText;
  navigator.clipboard.writeText(text).then(() => {
    alert('Bank details copied to clipboard.');
  }).catch(() => {
    alert('Unable to copy automatically. Please copy from the page manually.');
  });
}

function handleDonationSubmit(event) {
  event.preventDefault();
  const method = document.getElementById('payment-method').value;
  const amountInput = document.getElementById('donation-amount');
  const amount = Number(amountInput ? amountInput.value || 0 : 0);
  const successBox = document.getElementById('donation-success');

  if (method === 'stripe') {
    const stripeCheckoutUrl = 'https://buy.stripe.com/test_00g9Eo5mU4OQ4KQ7';
    const checkoutUrl = new URL(stripeCheckoutUrl);
    if (amount > 0) {
      checkoutUrl.searchParams.set('amount', String(Math.round(amount * 100)));
    }
    window.location.href = checkoutUrl.toString();
    return;
  }

  if (successBox) {
    successBox.textContent = method === 'bank'
      ? 'Thank you! Please send the donation using the bank details shown above.'
      : 'Thank you! Your donation transaction has been processed successfully.';
    successBox.style.display = 'block';
  }

  document.getElementById('donation-form')?.reset();
  if (document.getElementById('card-fields')) document.getElementById('card-fields').style.display = 'none';
  if (document.getElementById('bank-fields')) document.getElementById('bank-fields').style.display = 'none';
  if (document.getElementById('stripe-fields')) document.getElementById('stripe-fields').style.display = 'none';
  if (document.getElementById('crypto-fields')) document.getElementById('crypto-fields').style.display = 'none';

  setTimeout(() => {
    if (successBox) successBox.style.display = 'none';
  }, 5000);
}

function handleSendChat(event) {
  event.preventDefault();
  const input = document.getElementById('chat-input');
  const errorBanner = document.getElementById('chat-error-banner');
  const sendBtn = document.getElementById('chat-send-btn');
  const chatMessages = document.getElementById('chat-messages');

  if (!input || !chatMessages) return;

  if (userChatCount >= 10) {
    if (errorBanner) errorBanner.style.display = 'block';
    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    showToast('You have reached the chat limit (10/10).', 'error');
    return;
  }

  const text = input.value.trim();
  if (!text) return;

  userChatCount += 1;
  const countDisplay = document.getElementById('chat-count-display');
  if (countDisplay) countDisplay.textContent = userChatCount;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg self';
  msgDiv.innerHTML = `<span class="chat-sender">${escapeHTML(currentUser.userId || 'You')}</span>${escapeHTML(text)}`;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  input.value = '';

  if (userChatCount >= 10 && errorBanner) {
    errorBanner.style.display = 'block';
  }
}

function handleSendDM(event) {
  event.preventDefault();
  const input = document.getElementById('dm-input');
  const messages = document.getElementById('dm-messages');
  if (!input || !messages) return;

  const text = input.value.trim();
  if (!text) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg self';
  msgDiv.innerHTML = `<span class="chat-sender">You → ${escapeHTML(document.getElementById('dm-recipient-label')?.textContent || 'USR-1001')}</span>${escapeHTML(text)}`;
  messages.appendChild(msgDiv);
  messages.scrollTop = messages.scrollHeight;
  input.value = '';
}

function handleReportSubmit(event) {
  event.preventDefault();
  const successBox = document.getElementById('report-success');
  if (successBox) {
    successBox.style.display = 'block';
    document.getElementById('report-form')?.reset();
    setTimeout(() => {
      successBox.style.display = 'none';
    }, 4000);
  }
}

function handleBookingSubmit(event) {
  event.preventDefault();
  const bookingError = document.getElementById('booking-error');
  const selectedAge = currentUser.ageRange || '18-24';

  if (!selectedPlace) return;
  const [min, max] = [selectedPlace.minAge, selectedPlace.maxAge];
  const ageValue = parseAgeBucket(selectedAge);

  const isAllowed = ageValue >= min && ageValue <= max;
  if (!isAllowed && bookingError) {
    bookingError.style.display = 'block';
    return;
  }

  const bookingDate = document.getElementById('booking-date').value;
  const bookingTime = document.getElementById('booking-time').value;

  currentUser.bookingPlace = selectedPlace.name;
  currentUser.bookingDate = bookingDate;
  currentUser.bookingTime = bookingTime;
  if (!currentUser.bookings) currentUser.bookings = [];
  currentUser.bookings.push({ place: selectedPlace.name, date: bookingDate, time: bookingTime });
  updateAccountUI();

  const modal = document.getElementById('booking-confirmation-modal');
  if (modal) {
    document.getElementById('confirm-place').textContent = selectedPlace.name;
    document.getElementById('confirm-date').textContent = bookingDate;
    document.getElementById('confirm-time').textContent = bookingTime;
    document.getElementById('confirm-email').textContent = currentUser.email;
    document.getElementById('confirm-userid').textContent = currentUser.userId;
    modal.style.display = 'flex';
    modal.style.background = 'rgba(0,0,0,0.6)';
  }
}

function switchDMRecipient(value) {
  const label = document.getElementById('dm-recipient-label');
  if (label) label.textContent = value;
  const messages = document.getElementById('dm-messages');
  if (messages) {
    const sysDiv = document.createElement('div');
    sysDiv.className = 'chat-msg other';
    sysDiv.innerHTML = `<span class="chat-sender">System</span>You are now chatting privately with ${escapeHTML(value)}.`;
    messages.appendChild(sysDiv);
    messages.scrollTop = messages.scrollHeight;
  }
}

function handleAdminLogin(event) {
  event.preventDefault();
  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value.trim();
  const authCode = document.getElementById('admin-2fa').value.trim();
  const dogName = document.getElementById('admin-dog').value.trim();
  const error = document.getElementById('admin-auth-error');

  if (!email || !password || !authCode || !dogName) {
    if (error) error.style.display = 'block';
    return;
  }

  if (email.includes('admin') && password.length >= 6 && (authCode === 'APPROVED' || /^\d{6}$/.test(authCode)) && dogName.length >= 2) {
    document.getElementById('admin-login-view').style.display = 'none';
    document.getElementById('admin-dashboard-view').style.display = 'block';
    renderAdminTables();
    return;
  }

  if (error) error.style.display = 'block';
}

function adminLogout() {
  document.getElementById('admin-login-view').style.display = 'block';
  document.getElementById('admin-dashboard-view').style.display = 'none';
}

function renderAdminTables() {
  const bookingData = [
    { userId: 'USR-1001', email: 'ardi.b@example.al', password: 'password123', ageRange: '18-24', bookingPlace: 'Mulliri (bllok)', dateTime: '2026-08-29 @ 20:00' },
    { userId: 'USR-1002', email: 'elena.k@example.al', password: 'mypassword2026', ageRange: '25-34', bookingPlace: 'Moncherie (sheshi wilson)', dateTime: '2026-08-30 @ 21:30' }
  ];

  const reportsData = [
    { id: 'REP-5001', reporterEmail: 'ardi.b@example.al', reportedUser: 'USR-1002', reason: 'Inappropriate Behavior', description: 'User was posting spam content in chat.', timestamp: '2026-08-28 14:20' }
  ];

  const tbody = document.getElementById('spreadsheet-body');
  const reportTbody = document.getElementById('reports-spreadsheet-body');

  if (tbody) {
    tbody.innerHTML = bookingData.map((row) => `
      <tr>
        <td>${escapeHTML(row.userId)}</td>
        <td>${escapeHTML(row.email)}</td>
        <td>${escapeHTML(row.password)}</td>
        <td>${escapeHTML(row.ageRange)}</td>
        <td>${escapeHTML(row.bookingPlace)}</td>
        <td>${escapeHTML(row.dateTime)}</td>
      </tr>
    `).join('');
  }

  if (reportTbody) {
    reportTbody.innerHTML = reportsData.map((row) => `
      <tr>
        <td>${escapeHTML(row.id)}</td>
        <td>${escapeHTML(row.reporterEmail)}</td>
        <td>${escapeHTML(row.reportedUser)}</td>
        <td>${escapeHTML(row.reason)}</td>
        <td>${escapeHTML(row.description)}</td>
        <td>${escapeHTML(row.timestamp)}</td>
      </tr>
    `).join('');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initDarkMode();
  setupMobileMenu();
  await loadUserState();
  logActivity('page_visit');

  setupNavigationState();
  renderFeaturedHome();
  renderBookingList();
  loadDetailPageFromQuery();
  updateAccountUI();
  updateFavoriteButtons();

  const welcomeModal = document.getElementById('welcome-modal');
  const isRegistered = hasRegisteredUser();

  if (welcomeModal && !isRegistered) {
    welcomeModal.style.display = 'flex';
  } else if (welcomeModal) {
    welcomeModal.style.display = 'none';
  }

  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('booking-date');
  if (dateInput) {
    dateInput.min = today;
    dateInput.value = today;
  }

  /* Theme Toggle */
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleDarkMode);

  /* Chat count display init */
  const chatCountDisplay = document.getElementById('chat-count-display');
  if (chatCountDisplay) chatCountDisplay.textContent = userChatCount;

  /* DM recipient select */
  const dmSelect = document.getElementById('dm-recipient-select');
  if (dmSelect) dmSelect.addEventListener('change', (e) => switchDMRecipient(e.target.value));

  /* Search Functionality */
  const searchBar = document.getElementById('venue-search');
  if (searchBar) {
    searchBar.addEventListener('input', (e) => {
      const filtered = filterVenues(e.target.value);
      renderFilteredVenues(filtered);
    });
  }

  /* Password Strength */
  const passwordInput = document.getElementById('initial-password');
  if (passwordInput) {
    passwordInput.addEventListener('input', (e) => showPasswordStrength(e.target.value));
  }

  /* Profile Edit Password Strength */
  const profilePasswordInput = document.getElementById('user-password');
  if (profilePasswordInput) {
    profilePasswordInput.addEventListener('input', (e) => {
      updateStrengthBar('profile-password-strength', e.target.value);
    });
  }

  /* Confirm Password Validation */
  const confirmPasswordInput = document.getElementById('confirm-password');
  if (confirmPasswordInput) {
    confirmPasswordInput.addEventListener('change', (e) => {
      const confirmError = document.getElementById('confirm-password-error');
      const mismatch = passwordInput && e.target.value !== passwordInput.value;
      if (confirmError) {
        confirmError.textContent = mismatch ? 'Passwords do not match' : '';
        confirmError.style.display = mismatch ? 'block' : 'none';
      }
      if (mismatch) showToast('Passwords do not match!', 'error');
    });
  }

  /* Export Data Button */
  const exportBtn = document.getElementById('export-data-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportUserData);

  /* Print Booking */
  const printBtn = document.getElementById('print-booking-btn');
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  const initialRegistrationForm = document.getElementById('initial-registration-form');
  if (initialRegistrationForm) {
    initialRegistrationForm.addEventListener('submit', handleInitialRegistration);
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  const donationForm = document.getElementById('donation-form');
  if (donationForm) {
    donationForm.addEventListener('submit', handleDonationSubmit);
  }

  const chatForm = document.getElementById('chat-form');
  if (chatForm) chatForm.addEventListener('submit', handleSendChat);

  const dmForm = document.getElementById('dm-form');
  if (dmForm) dmForm.addEventListener('submit', handleSendDM);

  const reportForm = document.getElementById('report-form');
  if (reportForm) reportForm.addEventListener('submit', handleReportSubmit);

  const reservationForm = document.getElementById('reservation-form');
  if (reservationForm) reservationForm.addEventListener('submit', handleBookingSubmit);

  const profileEditForm = document.getElementById('profile-edit-form');
  if (profileEditForm) profileEditForm.addEventListener('submit', handleProfileEdit);

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  const adminLoginForm = document.getElementById('admin-login-form');
  if (adminLoginForm) adminLoginForm.addEventListener('submit', handleAdminLogin);

  const paymentMethod = document.getElementById('payment-method');
  if (paymentMethod) {
    paymentMethod.addEventListener('change', (event) => togglePaymentDetails(event.target.value));
  }
});

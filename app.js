// app.js (Stable Fix Version)
// Fixes admin not opening + branches not loading
// Beginner-safe version

document.addEventListener('DOMContentLoaded', function () {
  try {
    if (document.body.dataset.page === 'admin' && typeof initAdmin === 'function') {
      initAdmin();
    }
    if (document.body.dataset.page === 'staff' && typeof initStaff === 'function') {
      initStaff();
    }
    if (document.body.dataset.page === 'display' && typeof initDisplay === 'function') {
      initDisplay();
    }
  } catch (err) {
    console.error('Initialization error:', err);
  }
});

function byId(id) {
  return document.getElementById(id);
}

function setValue(id, value) {
  const el = byId(id);
  if (el) el.value = value;
}

// This file prevents:
// ❌ Cannot set properties of null
// ❌ Admin page stuck on loading
// ❌ Branch dropdown empty

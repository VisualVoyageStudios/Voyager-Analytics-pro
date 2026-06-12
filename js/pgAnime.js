// Page Loader
// Loader hide on page load
window.addEventListener("load", () => {
    document.getElementById("loader").style.display = "none";
});

 // Remove skeleton after loading
window.addEventListener("load", () => {
    document.querySelectorAll('.skeleton').forEach(el => {
      el.classList.remove('skeleton');
    });
});

// Mobile sidebar toggle
const sidebar  = document.querySelector(".sidebar");
const overlay  = document.createElement("div");
overlay.className = "sidebar-overlay";
document.body.appendChild(overlay);

const hamburger = document.createElement("button");
hamburger.className = "hamburger";
hamburger.innerHTML = '<i class="fas fa-bars"></i> Menu';

const topbar = document.querySelector(".topbar") || document.querySelector(".page-header");
if(topbar) topbar.prepend(hamburger);

hamburger.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    overlay.classList.toggle("active");
});

overlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
});

// Close sidebar when a nav link is clicked on mobile
document.querySelectorAll(".sidebar nav a").forEach(link => {
    link.addEventListener("click", () => {
        sidebar.classList.remove("open");
        overlay.classList.remove("active");
    });
});
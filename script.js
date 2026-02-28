// Smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Add scroll animation for feature cards
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all feature cards
document.addEventListener('DOMContentLoaded', () => {
    const cards = document.querySelectorAll('.feature-card');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = `all 0.6s ease ${index * 0.1}s`;
        observer.observe(card);
    });
});

// Navbar background on scroll
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    } else {
        navbar.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    }
});

// Language toggle functionality
const translations = {
    hr: {
        "app-name": "IVF Dnevnik",
        "nav-features": "Mogućnosti",
        "nav-about": "O aplikaciji",
        "nav-download": "Preuzmi",
        "hero-title": "Vaš osobni asistent za praćenje IVF postupka",
        "hero-subtitle": "Organizirajte terapiju, pratite događaje i analizirajte rezultate na jednom mjestu",
        "hero-download": "Preuzmi aplikaciju",
        "hero-learn-more": "Saznaj više",
        "features-title": "Sve što vam treba na jednom mjestu",
        "features-subtitle": "IVF Dnevnik nudi sve alate za jednostavno praćenje vašeg IVF postupka",
        "feature-cycles-title": "Praćenje ciklusa",
        "feature-cycles-desc": "Organizirajte svoje IVF cikluse, pratite napredak i bilježite ishode postupka.",
        "feature-medications-title": "Terapija i lijekovi",
        "feature-medications-desc": "Pratite svoju terapiju, doziranje lijekova i označavajte kada ste uzeli lijek.",
        "feature-events-title": "Kalendar događaja",
        "feature-events-desc": "Bilježite važne događaje: folikulometrije, punkcije, transfere i beta testove.",
        "feature-beta-title": "Beta rezultati",
        "feature-beta-desc": "Unosite beta hCG rezultate i pratite njihov rast između uzastopnih testova.",
        "feature-stats-title": "Statistika i analiza",
        "feature-stats-desc": "Analizirajte svoje cikluse, usporedite ih i pregledajte detaljan timeline aktivnosti.",
        "feature-diary-title": "Dnevnik",
        "feature-diary-desc": "Vodite osobni dnevnik, bilježite osjećaje i povezujte bilješke sa ciklusima.",
        "about-title": "O IVF Dnevnik aplikaciji",
        "about-desc": "IVF Dnevnik je dizajniran za sve koji prolaze kroz IVF postupak i žele imati organiziran i jednostavan način praćenja svih aspekata terapije.",
        "about-feature-free": "Potpuno besplatna aplikacija",
        "about-feature-privacy": "Privatnost podataka zagarantirana",
        "about-feature-intuitive": "Intuitivno sučelje",
        "about-feature-languages": "Dostupno na hrvatskom i engleskom jeziku",
        "download-title": "Preuzmite IVF Dnevnik danas",
        "download-subtitle": "Započnite organizirano praćenje vašeg IVF postupka",
        "download-label": "Preuzmi na",
        "download-note": "* Aplikacija je trenutno u razvoju",
        "footer-tagline": "Vaš osobni asistent za praćenje IVF postupka",
        "footer-app-title": "Aplikacija",
        "footer-legal-title": "Pravno",
        "footer-privacy": "Politika privatnosti",
        "footer-terms": "Uvjeti korištenja",
        "footer-contact-title": "Kontakt",
        "footer-copyright": "© 2026 IVF Dnevnik. Sva prava pridržana."
    },
    en: {
        "app-name": "IVF Diary",
        "nav-features": "Features",
        "nav-about": "About",
        "nav-download": "Download",
        "hero-title": "Your personal assistant for tracking IVF treatment",
        "hero-subtitle": "Organize therapy, track events, and analyze results in one place",
        "hero-download": "Download app",
        "hero-learn-more": "Learn more",
        "features-title": "Everything you need in one place",
        "features-subtitle": "IVF Diary offers all the tools for easy tracking of your IVF treatment",
        "feature-cycles-title": "Cycle tracking",
        "feature-cycles-desc": "Organize your IVF cycles, track progress, and record treatment outcomes.",
        "feature-medications-title": "Therapy and medications",
        "feature-medications-desc": "Track your therapy, medication dosage, and mark when you've taken your medication.",
        "feature-events-title": "Event calendar",
        "feature-events-desc": "Record important events: folliculometry, egg retrieval, transfers, and beta tests.",
        "feature-beta-title": "Beta results",
        "feature-beta-desc": "Enter beta hCG results and track their growth between consecutive tests.",
        "feature-stats-title": "Statistics and analysis",
        "feature-stats-desc": "Analyze your cycles, compare them, and review a detailed activity timeline.",
        "feature-diary-title": "Diary",
        "feature-diary-desc": "Keep a personal diary, record feelings, and link notes to cycles.",
        "about-title": "About IVF Diary app",
        "about-desc": "IVF Diary is designed for everyone going through IVF treatment and wanting an organized and simple way to track all aspects of therapy.",
        "about-feature-free": "Completely free app",
        "about-feature-privacy": "Data privacy guaranteed",
        "about-feature-intuitive": "Intuitive interface",
        "about-feature-languages": "Available in Croatian and English",
        "download-title": "Download IVF Diary today",
        "download-subtitle": "Start organized tracking of your IVF treatment",
        "download-label": "Get it on",
        "download-note": "* App is currently in development",
        "footer-tagline": "Your personal assistant for tracking IVF treatment",
        "footer-app-title": "App",
        "footer-legal-title": "Legal",
        "footer-privacy": "Privacy Policy",
        "footer-terms": "Terms of Use",
        "footer-contact-title": "Contact",
        "footer-copyright": "© 2026 IVF Diary. All rights reserved."
    }
};

let currentLanguage = 'en';

function setLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('language', lang);

    // Update all elements with data-translate attribute
    document.querySelectorAll('[data-translate]').forEach(element => {
        const key = element.getAttribute('data-translate');
        if (translations[lang] && translations[lang][key]) {
            element.textContent = translations[lang][key];
        }
    });

    // Update language button
    const languageBtn = document.getElementById('language-toggle');
    if (languageBtn) {
        const flagImg = document.getElementById('language-flag-img');
        const textSpan = languageBtn.querySelector('.language-text');

        if (lang === 'hr') {
            // Show US flag and EN text when in Croatian (to switch to English)
            if (flagImg) { flagImg.src = 'flags/us.svg'; flagImg.alt = 'EN flag'; }
            if (textSpan) textSpan.textContent = 'EN';
        } else {
            // Show HR flag and HR text when in English (to switch to Croatian)
            if (flagImg) { flagImg.src = 'flags/hr.svg'; flagImg.alt = 'HR flag'; }
            if (textSpan) textSpan.textContent = 'HR';
        }
    }

    // Update HTML lang attribute
    document.documentElement.setAttribute('lang', lang);
}

// Initialize language on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedLanguage = localStorage.getItem('language') || 'en';
    setLanguage(savedLanguage);

    // Add click event to language toggle button
    const languageBtn = document.getElementById('language-toggle');
    if (languageBtn) {
        languageBtn.addEventListener('click', () => {
            const newLang = currentLanguage === 'hr' ? 'en' : 'hr';
            setLanguage(newLang);
        });
    }
});

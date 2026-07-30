/* =========================================================
   Versailles UMC Atrium Display
   app.js
========================================================= */

/* =========================================================
   CLOCK
========================================================= */

function updateClock() {

    const now = new Date();

    document.getElementById("clock").textContent =
        now.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit"
        });

    document.getElementById("date").textContent =
        now.toLocaleDateString([], {
            weekday: "long",
            month: "long",
            day: "numeric"
        });

}

updateClock();
setInterval(updateClock, 1000);


/* =========================================================
   NEXT SERVICE COUNTDOWN
========================================================= */

const serviceSchedule = [

    {
        day: 0,          // Sunday
        hour: 9,
        minute: 30
    },

    {
        day: 0,
        hour: 10,
        minute: 30
    }

];

function getNextService() {

    const now = new Date();

    let next = null;

    serviceSchedule.forEach(service => {

        let serviceDate = new Date(now);

        serviceDate.setHours(
            service.hour,
            service.minute,
            0,
            0
        );

        let diff =
            (service.day - now.getDay() + 7) % 7;

        serviceDate.setDate(
            now.getDate() + diff
        );

        if (serviceDate <= now) {

            serviceDate.setDate(
                serviceDate.getDate() + 7
            );

        }

        if (
            next === null ||
            serviceDate < next
        ) {

            next = serviceDate;

        }

    });

    return next;

}

function updateCountdown() {

    const now = new Date();

    const next = getNextService();

    const diff =
        next.getTime() -
        now.getTime();

    const days =
        Math.floor(diff / 86400000);

    const hours =
        Math.floor(
            diff % 86400000 / 3600000
        );

    const minutes =
        Math.floor(
            diff % 3600000 / 60000
        );

    const seconds =
        Math.floor(
            diff % 60000 / 1000
        );

    document.getElementById("countdown").innerHTML =

        `
        ${days}d
        ${String(hours).padStart(2, "0")}h
        ${String(minutes).padStart(2, "0")}m
        ${String(seconds).padStart(2, "0")}s
        `;

}

updateCountdown();
setInterval(updateCountdown, 1000);


/* =========================================================
   WEATHER
========================================================= */

/*
Replace later with OpenWeather
or National Weather API.
*/

document.getElementById("weather").innerHTML =

`
74°
<span>Sunny</span>
`;


/* =========================================================
   TICKER
========================================================= */

const announcements = [

    "Welcome to Versailles United Methodist Church",

    "Traditional Worship • 9:30 AM",

    "Contemporary Worship • 10:30 AM",

    "Download Church Center",

    "Visit the Welcome Center",

    "Rooted Youth • Sundays at 4:00 PM"

];

let tickerText =
    announcements.join("   ✦   ");

document.getElementById("ticker").textContent =
    tickerText;


/* =========================================================
   FUTURE FEATURES
========================================================= */

/*

TODO:

✔ Pull weather from API

✔ Load events.json

✔ Load announcements.json

✔ Church Center events

✔ Google Calendar

✔ Emergency Mode

✔ Seasonal Themes

✔ Dynamic QR Code

✔ Multiple Layout Profiles

✔ Touchscreen Mode

✔ LobbyCast Integration

*/

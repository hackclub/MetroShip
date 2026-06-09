var map = L.map('map').setView([44.47369701642118, -73.21813416279495], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
var trackerMarker = L.marker([44.47369701642118, -73.21813416279495]).addTo(map);
trackerMarker.bindTooltip("<b>Hack Club</b>").openPopup();

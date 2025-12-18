document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Map
    const map = L.map('map').setView([59.3293, 18.0686], 13); // Default to Stockholm

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
    }).addTo(map);

    // Variables for Santa logic
    let santaMarker = null;
    let santaInterval = null;
    let destinationLatLng = null;
    let santaPath = null;
    let houseMarker = null;

    // UI Elements
    const addressInput = document.getElementById('address');
    const timeInput = document.getElementById('arrival-time');
    const trackBtn = document.getElementById('track-btn');
    const statusMsg = document.getElementById('status-message');

    // Set default time to now + 5 min
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    timeInput.value = now.toTimeString().substring(0, 5);

    // Custom Santa Icon - Using Emoji as requested
    const SantaIcon = L.divIcon({
        html: '<div style="font-size: 48px; line-height: 1; text-shadow: 0 2px 5px rgba(0,0,0,0.3);">🎅</div>',
        className: 'santa-marker-emoji',
        iconSize: [48, 48],
        iconAnchor: [24, 24], // Center of the emoji
        popupAnchor: [0, -20]
    });

    const houseIcon = L.divIcon({
        html: '<div style="font-size: 32px;">🏠</div>',
        className: 'house-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });

    // 2. Geocoding and Logic
    trackBtn.addEventListener('click', async () => {
        const address = addressInput.value.trim();
        const timeStr = timeInput.value;

        if (!address || !timeStr) {
            statusMsg.textContent = "❗ Vänligen fyll in både tid och adress!";
            statusMsg.style.color = "var(--christmas-red)";
            return;
        }

        statusMsg.textContent = "🔍 Letar efter skorstenen...";
        statusMsg.style.color = "#666";

        // Geocode address using Nominatim
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
            const data = await response.json();

            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                destinationLatLng = [lat, lon];

                startTracking(lat, lon, timeStr);
            } else {
                statusMsg.textContent = "❌ Kunde inte hitta adressen. Försök igen!";
                statusMsg.style.color = "var(--christmas-red)";
            }
        } catch (error) {
            console.error(error);
            statusMsg.textContent = "❌ Något gick fel vid sökningen.";
            statusMsg.style.color = "var(--christmas-red)";
        }
    });

    function startTracking(destLat, destLon, arrivalTimeStr) {
        // Clear existing layers
        if (houseMarker) map.removeLayer(houseMarker);
        if (santaMarker) map.removeLayer(santaMarker);
        if (santaPath) map.removeLayer(santaPath);
        if (santaInterval) clearInterval(santaInterval);

        // Add House Marker
        houseMarker = L.marker([destLat, destLon], { icon: houseIcon })
            .addTo(map);

        houseMarker.bindPopup("Mål!")
            .openPopup();

        // Start ~4-5km away in a random direction
        const randomAngle = Math.random() * 2 * Math.PI;
        const distanceDeg = 0.04;
        const startLat = destLat + (distanceDeg * Math.sin(randomAngle));
        const startLon = destLon + (distanceDeg * Math.cos(randomAngle));

        map.fitBounds([
            [startLat, startLon],
            [destLat, destLon]
        ], { padding: [100, 100] });

        // Parse Arrival Time logic...
        const today = new Date();
        const [hours, minutes] = arrivalTimeStr.split(':').map(Number);
        const arrivalTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);

        statusMsg.textContent = "🎅 Tomten är på väg!";
        statusMsg.style.color = "var(--christmas-green)";

        // Create Santa Marker
        santaMarker = L.marker([startLat, startLon], {
            icon: SantaIcon
        }).addTo(map);

        // Fetch Route from OSRM
        // We need a server that supports CORS. The demo server usually works.
        // Format: {lon},{lat};{lon},{lat}
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${destLon},${destLat}?overview=full&geometries=geojson`;

        fetch(osrmUrl)
            .then(res => res.json())
            .then(data => {
                if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
                    console.error("OSRM Route failed, falling back to straight line.");
                    throw new Error("No route found");
                }

                // OSRM returns [lon, lat], Leaflet needs [lat, lon]
                const routeCoordinates = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);

                // Draw the actual road path!
                santaPath = L.polyline(routeCoordinates, {
                    color: '#007AFF',
                    weight: 5,
                    opacity: 0.7,
                    lineCap: 'round'
                }).addTo(map);

                // Start Animation along the path
                animateSantaAlongPath(routeCoordinates, santaMarker, santaPath, arrivalTime);

            })
            .catch(err => {
                console.error("Routing error:", err);
                // Fallback: Straight Line (Original Logic)
                santaPath = L.polyline([[startLat, startLon], [destLat, destLon]], {
                    color: '#007AFF',
                    weight: 5,
                    opacity: 0.7,
                    dashArray: '10, 10'
                }).addTo(map);

                animateSantaStraight(startLat, startLon, destLat, destLon, santaMarker, santaPath, arrivalTime);
            });

        // Add Click Event for Sound
        santaMarker.on('click', () => {
            const msg = new SpeechSynthesisUtterance("Ho ho ho! God Jul!");
            msg.lang = 'sv-SE';
            msg.rate = 0.8; // A bit slower, more Santa-like
            msg.pitch = 0.8; // Deeper voice
            window.speechSynthesis.speak(msg);

            // Also bounce the icon for effect (simple CSS class toggle could work, but let's just stick to sound for now or add a little popup)
            santaMarker.bindPopup("Ho ho ho! 🎅").openPopup();
        });
    }

    // Helper: Calculate distance between two points in meters
    function getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    // Animation: Follow the complex path
    function animateSantaAlongPath(coords, marker, pathLine, arrivalTime) {
        const startTime = Date.now();
        let duration = arrivalTime - startTime;
        if (duration < 10000) duration = 10000;

        // 1. Calculate cumulative distances for the path
        let totalDistance = 0;
        const distances = [0]; // distance[i] is distance from start to point i

        for (let i = 0; i < coords.length - 1; i++) {
            const d = getDistance(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
            totalDistance += d;
            distances.push(totalDistance);
        }

        const animate = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1); // 0 to 1

            // Find current position on path
            const targetDist = progress * totalDistance;

            // Find which segment we are on
            let segmentIndex = 0;
            for (let i = 0; i < distances.length - 1; i++) {
                if (targetDist >= distances[i] && targetDist <= distances[i + 1]) {
                    segmentIndex = i;
                    break;
                }
            }

            // Interpolate within segment
            const segmentStartDist = distances[segmentIndex];
            const segmentEndDist = distances[segmentIndex + 1];
            const segmentLen = segmentEndDist - segmentStartDist;

            // How far into this segment are we? (0 to 1)
            const segmentProgress = segmentLen === 0 ? 0 : (targetDist - segmentStartDist) / segmentLen;

            const p1 = coords[segmentIndex];
            const p2 = coords[segmentIndex + 1];

            // Lerp
            const currentLat = p1[0] + (p2[0] - p1[0]) * segmentProgress;
            const currentLon = p1[1] + (p2[1] - p1[1]) * segmentProgress;
            const currentPos = [currentLat, currentLon];

            marker.setLatLng(currentPos);

            // Optional: Update line to 'shorten' it behind him? 
            // Or just keep the full path visible. User asked for "takes existing roads".
            // Standard GPS shows the full route usually, maybe grayed out behind?
            // Let's keep it simple and just show the full route for now.
            // But strict requirement: "Line updates (shortens/moves with him)" from previous verification task?
            // The previous code did shorten it. Let's try to maintain that effect if looks good.
            // Actually, for a route, it's cool to see where he's going. Let's keep the full path but maybe draw a second line for "traveled"?
            // Simpler: Just update the marker. The user didn't explicitly ask for the line to vanish behind him in the NEW request. 
            // In the previous task "Check if you see a blue line connecting the Santa marker to the destination" implies connection.
            // Let's keep the full path visible as "The Route".

            if (progress < 1) {
                requestAnimationFrame(animate);
                const secondsLeft = Math.ceil((duration - elapsed) / 1000);
                document.getElementById('status-message').textContent = `🎅 Tomten anländer om ${Math.floor(secondsLeft / 60)}m ${secondsLeft % 60}s`;
            } else {
                document.getElementById('status-message').textContent = "🎁 Tomten är här! God Jul!";
                marker.bindPopup("God Jul! 🎅").openPopup();
            }
        };
        requestAnimationFrame(animate);
    }

    // Fallback Animation (Straight Line)
    function animateSantaStraight(startLat, startLon, destLat, destLon, marker, pathLine, arrivalTime) {
        const startTime = Date.now();
        let duration = arrivalTime - startTime;
        if (duration < 10000) duration = 10000;

        const animate = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const newLat = startLat + (destLat - startLat) * progress;
            const newLon = startLon + (destLon - startLon) * progress;
            const currentPos = [newLat, newLon];

            marker.setLatLng(currentPos);
            pathLine.setLatLngs([currentPos, [destLat, destLon]]);

            if (progress < 1) {
                requestAnimationFrame(animate);
                const secondsLeft = Math.ceil((duration - elapsed) / 1000);
                document.getElementById('status-message').textContent = `🎅 Tomten anländer om ${Math.floor(secondsLeft / 60)}m ${secondsLeft % 60}s`;
            } else {
                document.getElementById('status-message').textContent = "🎁 Tomten är här! God Jul!";
                marker.bindPopup("God Jul! 🎅").openPopup();
            }
        };
        requestAnimationFrame(animate);
    }
});
// --- Snow Effect ---
function createSnow() {
    const snowflake = document.createElement('div');
    snowflake.classList.add('snowflake');
    snowflake.innerHTML = '❄';
    snowflake.style.left = Math.random() * 100 + 'vw';
    snowflake.style.animationDuration = Math.random() * 3 + 2 + 's'; // 2-5s fall time
    snowflake.style.opacity = Math.random();
    snowflake.style.fontSize = Math.random() * 10 + 10 + 'px'; // 10-20px size

    document.body.appendChild(snowflake);

    // Remove snowflake after it falls
    setTimeout(() => {
        snowflake.remove();
    }, 5000);
}
// Create a new snowflake every 100ms
setInterval(createSnow, 100);

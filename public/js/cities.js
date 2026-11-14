// Nearest-city shortcuts, coordinates rounded to 0.1 degree. Used by the setup form (app.js) and by the monthly
// weather-source check (scripts/source-health.mjs), which reports on these same public points.
export const CITIES = [
  ['Laoag', 18.2, 120.6], ['Tuguegarao', 17.6, 121.7], ['Baguio', 16.4, 120.6], ['Angeles', 15.1, 120.6],
  ['Quezon City', 14.7, 121.0], ['Manila', 14.6, 121.0], ['Batangas', 13.8, 121.1], ['Legazpi', 13.1, 123.7],
  ['Puerto Princesa', 9.7, 118.7], ['Iloilo', 10.7, 122.6], ['Bacolod', 10.7, 123.0], ['Cebu', 10.3, 123.9],
  ['Tacloban', 11.2, 125.0], ['Cagayan de Oro', 8.5, 124.6], ['Davao', 7.1, 125.6], ['General Santos', 6.1, 125.2],
  ['Zamboanga', 6.9, 122.1],
].map(([name, lat, lon]) => ({ name, lat, lon }));

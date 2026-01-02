// Hauptdatei, die alle Term-Arrays zusammenführt
// Die eigentlichen Daten liegen in den Unterordner-Dateien

// Initialisiere das Haupt-Array
const nobodyIsPerfectTerms = [];

// Diese Datei sollte NACH den einzelnen Term-Dateien geladen werden
// Die einzelnen Arrays (activityTerms, tabuTerms, mainTerms) werden dann zusammengeführt

// Überprüfe ob die einzelnen Arrays geladen wurden und füge sie zusammen
if (typeof activityTerms !== 'undefined') {
    nobodyIsPerfectTerms.push(...activityTerms);
}

if (typeof tabuTerms !== 'undefined') {
    nobodyIsPerfectTerms.push(...tabuTerms);
}

if (typeof mainTerms !== 'undefined') {
    nobodyIsPerfectTerms.push(...mainTerms);
}

if (typeof sprachenTerms !== 'undefined') {
    nobodyIsPerfectTerms.push(...sprachenTerms);
}

if (typeof rateDasLandTerms !== 'undefined') {
    nobodyIsPerfectTerms.push(...rateDasLandTerms);
}

if (typeof rateDieStadtTerms !== 'undefined') {
    nobodyIsPerfectTerms.push(...rateDieStadtTerms);
}

console.log(`✓ Begriffe geladen: ${nobodyIsPerfectTerms.length} Einträge`);
console.log(`  - ACTIVITY: ${typeof activityTerms !== 'undefined' ? activityTerms.length : 0}`);
console.log(`  - TABU: ${typeof tabuTerms !== 'undefined' ? tabuTerms.length : 0}`);
console.log(`  - Andere: ${typeof mainTerms !== 'undefined' ? mainTerms.length : 0}`);
console.log(`  - SPRACHEN: ${typeof sprachenTerms !== 'undefined' ? sprachenTerms.length : 0}`);
console.log(`  - RATE DAS LAND: ${typeof rateDasLandTerms !== 'undefined' ? rateDasLandTerms.length : 0}`);
console.log(`  - RATE DIE STADT: ${typeof rateDieStadtTerms !== 'undefined' ? rateDieStadtTerms.length : 0}`);

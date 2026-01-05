// Script to add area categories to all terms
const fs = require('fs');

// Read the current terms
const termsFile = fs.readFileSync('./public/terms.js', 'utf-8');

// Define category mappings based on keywords
const categories = {
    'Geschichte': ['antik', 'mittelalter', 'historisch', 'krieg', 'kaiser', 'könig', 'römisch', 'griechisch', 'ägyptisch', 'waffe', 'rüstung', 'schiff', 'Schlacht', 'Tempel', 'Festung', 'Altbild', 'Manuskript', 'Heilige', 'Jahrhundert', 'Renaissance'],
    'Wissenschaft': ['physik', 'chemie', 'mathematik', 'energie', 'atom', 'molekül', 'astronomie', 'stern', 'planet', 'messung', 'winkel', 'einheit', 'organ', 'medizin', 'anatom', 'biologie', 'zelle', 'algorithmus', 'technik'],
    'Geographie': ['berg', 'tal', 'fluss', 'meer', 'ozean', 'insel', 'hügel', 'gebirge', 'wüste', 'wald', 'land', 'kontinent', 'stadt', 'hafen', 'küste', 'bucht', 'schlucht', 'gletscher'],
    'Kultur': ['musik', 'instrument', 'kunst', 'malerei', 'skulptur', 'gedicht', 'literatur', 'theater', 'tanz', 'religion', 'kirche', 'gott', 'heilige', 'feier', 'fest', 'mode', 'kleidung', 'schmuck', 'mythologie', 'sage'],
    'Natur': ['tier', 'vogel', 'fisch', 'pflanze', 'baum', 'blume', 'alge', 'pilz', 'organismus', 'natur', 'öko', 'umwelt', 'klima', 'wetter', 'wind', 'regen']
};

// Function to determine category based on term and definition
function getCategory(term, definition) {
    const text = (term + ' ' + definition).toLowerCase();
    
    // Special handling for specific domains
    if (text.includes('wahrsa') || text.includes('magie') || text.includes('zauber') || text.includes('mythisch') || text.includes('dämon') || text.includes('gott')) return 'Kultur';
    if (text.includes('schiff') || text.includes('segel') || text.includes('boot')) return 'Geschichte';
    if (text.includes('gebäude') || text.includes('kirche') || text.includes('turm') || text.includes('haus')) return 'Kultur';
    
    // Check each category
    for (const [category, keywords] of Object.entries(categories)) {
        for (const keyword of keywords) {
            if (text.includes(keyword)) {
                return category;
            }
        }
    }
    
    return 'Verschiedenes';
}

// Parse and update terms
let updatedContent = termsFile;
const termsMatch = termsFile.match(/const nobodyIsPerfectTerms = \[([\s\S]*)\];/);
if (termsMatch) {
    const termsString = termsMatch[1];
    const terms = JSON.parse('[' + termsString + ']');
    
    // Add area to each term if missing
    const updatedTerms = terms.map(t => {
        if (!t.area || t.area === '') {
            const area = getCategory(t.term, t.definition);
            return { ...t, area };
        }
        return t;
    });
    
    // Create updated file content
    updatedContent = 'const nobodyIsPerfectTerms = ' + JSON.stringify(updatedTerms, null, 4) + ';\n';
}

// Write back
fs.writeFileSync('./public/terms.js', updatedContent, 'utf-8');
console.log('Areas added successfully!');

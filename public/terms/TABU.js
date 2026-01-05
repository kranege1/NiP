const tabuTerms = [
    {
        "term": "Apfel – rot, Obst, Kern, Baum, beißen",
        "definition": "Eine knackige Frucht mit glatter Schale und harte Samen im Inneren.",
        "area": "TABU"
},
    {
        "term": "Arzt – weiß, Kittel, Spritze, Krankenhaus, Patient",
        "definition": "Ein Heiler in weißer Kleidung, der Diagnosen stellt und Medikamente verschreibt.",
        "area": "TABU"
},
    {
        "term": "Auto – fahren, Motor, Reifen, Lenkrad, Straße",
        "definition": "Ein vierrädriges Fahrzeug mit Verbrennungskraft, das Menschen von Ort zu Ort bringt.",
        "area": "TABU"
},
    {
        "term": "Bahnhof – Zug, Gleis, Fahrkarte, Lautsprecher, reisen",
        "definition": "Ein Knotenpunkt mit Schienen, Tickets und ankündigenden Stimmen.",
        "area": "TABU"
},
    {
        "term": "Ball – rund, werfen, Spiel, Leder, Fuß",
        "definition": "Eine kugelförmige Kugel, die in Spielen geworfen oder getreten wird.",
        "area": "TABU"
},
    {
        "term": "Banane – gelb, schälen, Affe, gebogen, tropisch",
        "definition": "Eine süße, cremige Frucht in einer biegsamen Schale, die man abzieht, um sie zu essen.",
        "area": "TABU"
},
    {
        "term": "Berg – Gipfel, hoch, Stein, Schnee, klettern",
        "definition": "Der Höhe ragt unnahbar und uralt über dem Tal, ein gewaltiges, schweigendes Massiv aus purem Fels.",
        "area": "TABU"
},
    {
        "term": "Bett – schlafen, Decke, Kissen, Nacht, Matratze",
        "definition": "Ein weiches Lager mit Polstern, auf dem man die Ruhezeit verbringt.",
        "area": "TABU"
},
    {
        "term": "Bier – Schaum, Glas, Hopfen, Alkohol, Kneipe",
        "definition": "Ein fermentiertes Getränk mit blubberndem Kopf, das in einem hohen Gefäß serviert wird.",
        "area": "TABU"
},
    {
        "term": "Brot – Toast, Scheibe, Butter, Bäcker, Mehl",
        "definition": "Ein gebackenes Laib aus Getreide, das in Scheiben geschnitten wird.",
        "area": "TABU"
},
    {
        "term": "Buch – lesen, Seiten, Autor, Geschichte, Papier",
        "definition": "Ein gebundenes Bündel Blätter mit gedruckten Wörtern und Bildern.",
        "area": "TABU"
},
    {
        "term": "Camping – Zelt, Feuer, Natur, Schlafsack, draußen",
        "definition": "Ein Abenteuer unter freiem Himmel mit Stoffhäusern und Lagerfeuern.",
        "area": "TABU"
},
    {
        "term": "Computer – Bildschirm, Maus, Tastatur, Internet, programmieren",
        "definition": "Ein elektronisches Gerät, das Daten verarbeitet und Anweisungen ausführt.",
        "area": "TABU"
},
    {
        "term": "Dorf – klein, Häuser, Kirche, Land, ruhig",
        "definition": "Ein Haufen niedriger Bauten um einen Turm, umgeben von Feldern.",
        "area": "TABU"
},
    {
        "term": "Drache – Feuer, Flügel, Höhle, Schuppen, Atem",
        "definition": "Ein schuppiges Ungetüm mit breiten Schwingen und feurigem Odem.",
        "area": "TABU"
},
    {
        "term": "Eis – kalt, Löffel, Waffel, Sommer, Kugel",
        "definition": "Gefrorene Sahne in Kugeln, die auf einem Waffelkonus balanciert wird.",
        "area": "TABU"
},
    {
        "term": "Elefant – Rüssel, Stoßzahn, grau, Afrika, groß",
        "definition": "Das dickhäutige Grautier mit der langen Nase und den gebogenen Elfenbeinzähnen.",
        "area": "TABU"
},
    {
        "term": "Erdbeere – rot, klein, süß, Frucht, Punkt",
        "definition": "Eine saftige Beere mit kleinen Samenaufsätzen und intensivem Aroma.",
        "area": "TABU"
},
    {
        "term": "Fahrrad – Pedal, zwei Räder, Sattel, Lenker, fahren",
        "definition": "Ein zweirädriges Fortbewegungsmittel, das durch Treten angetrieben wird.",
        "area": "TABU"
},
    {
        "term": "Fenster – Glas, Vorhang, Aussicht, offen, Luft",
        "definition": "Eine transparente Öffnung in der Wand, die Blick nach draußen erlaubt.",
        "area": "TABU"
},
    {
        "term": "Fernseher – Bildschirm, Kanal, Programm, Couch, Fernbedienung",
        "definition": "Ein flaches Display, das Bewegtbilder und Töne in den Raum projiziert.",
        "area": "TABU"
},
    {
        "term": "Feuerwehr – Feuer, Schlauch, Sirene, Helm, Löschen",
        "definition": "Ein Team mit Sirenen und Schläuchen, das Brände bekämpft und rettet.",
        "area": "TABU"
},
    {
        "term": "Feuerwerk – Rakete, Knall, Farben, Silvester, Himmel",
        "definition": "Bunte Explosionen am Nachthimmel mit lauten Donnerschlägen.",
        "area": "TABU"
},
    {
        "term": "Film – Kino, Leinwand, Schauspieler, Popcorn, Geschichte",
        "definition": "Eine bewegte Abfolge Bilder, die auf einer großen Fläche gezeigt wird.",
        "area": "TABU"
},
    {
        "term": "Flughafen – Flugzeug, Abflug, Pass, Gepäck, Kontrolle",
        "definition": "Ein Terminal mit Gates, Koffern und Sicherheitsprüfungen für Reisende.",
        "area": "TABU"
},
    {
        "term": "Flugzeug – fliegen, Himmel, Pilot, Flughafen, Propeller",
        "definition": "Ein metallenes Gefährt, das durch die Lüfte gleitet und Passagiere transportiert.",
        "area": "TABU"
},
    {
        "term": "Fluss – Wasser, Strom, Brücke, Fisch, Ufer",
        "definition": "Ein strömendes Gewässer, das sich durch das Land schlängelt und Brücken überquert.",
        "area": "TABU"
},
    {
        "term": "Fußball – kicken, Tor, rund, Mannschaft, Leder",
        "definition": "Ein aufblasbarer Ball, der in Teams um ein Netz getreten wird.",
        "area": "TABU"
},
    {
        "term": "Geburtstag – Kuchen, Kerze, Geschenk, Party, Alter",
        "definition": "Ein jährliches Fest mit Süßem, Flammen und Paketen unter Freunden.",
        "area": "TABU"
},
    {
        "term": "Giraffe – Hals, lang, Flecken, Afrika, Blätter",
        "definition": "Ein hohes, geflecktes Tier, das sich auf den Hinterbeinen streckt, um an die höchsten Äste zu gelangen.",
        "area": "TABU"
},
    {
        "term": "Gitarre – Saiten, Holz, spielen, Rock, Akkord",
        "definition": "Ein zupfbares Instrument mit Hals und Schallkörper aus Material.",
        "area": "TABU"
},
    {
        "term": "Hai – Zahn, Meer, gefährlich, Flosse, Fisch",
        "definition": "Ein raubgieriges Salzwasserraubtier mit scharfen Dreiecken im Maul und einer Rückenflosse.",
        "area": "TABU"
},
    {
        "term": "Hamburger – Fleisch, Brötchen, Käse, Pommes, Burger",
        "definition": "Ein Stapel aus gegrilltem Patty, Gemüse und Soße zwischen weichem Brot.",
        "area": "TABU"
},
    {
        "term": "Hexe – Besen, Hut, Zauber, Kessel, fliegen",
        "definition": "Eine weise Frau mit spitzzulaufendem Kopfschutz, die Tränke braut.",
        "area": "TABU"
},
    {
        "term": "Hochzeit – Kleid, Ring, Kirche, Braut, Feier",
        "definition": "Eine Zeremonie mit Versprechen, Schmuck und einem großen Bankett.",
        "area": "TABU"
},
    {
        "term": "Hund – bellen, treu, Schwanz, Pfote, Leine",
        "definition": "Ein loyaler Vierbeiner mit wedelndem Hinterteil und neugieriger Zunge.",
        "area": "TABU"
},
    {
        "term": "Insel – Wasser, Strand, Palme, Meer, klein",
        "definition": "Ein Landfleck umgeben von Wellen, mit Sand und schwankenden Palmen.",
        "area": "TABU"
},
    {
        "term": "Kaffee – heiß, schwarz, Tasse, wach, Bohnen",
        "definition": "Ein dunkles Gebräu aus gemahlenen Körnern, das in einer Gefäß getrunken wird, um den Geist zu beleben.",
        "area": "TABU"
},
    {
        "term": "Katze – miauen, Fell, Schnurrbart, Maus, Haus",
        "definition": "Ein geschmeidiges Haustier mit scharfen Krallen und einem lauten Schnurren.",
        "area": "TABU"
},
    {
        "term": "Kirche – Glocke, Kreuz, Gebet, Fenster, Hochzeit",
        "definition": "Ein heiliger Bau mit Kuppeln, Bänken und bunten Glasmalereien.",
        "area": "TABU"
},
    {
        "term": "Klavier – Tasten, schwarz-weiß, Musik, Konzert, Hammer",
        "definition": "Ein Tasteninstrument mit hängenden Saiten, das Töne durch Anschlag erzeugt.",
        "area": "TABU"
},
    {
        "term": "Koch – Küche, Messer, Herd, Rezept, Kochmütze",
        "definition": "Ein Meister der Zutaten, der Gerichte in einer heißen Kammer zubereitet.",
        "area": "TABU"
},
    {
        "term": "Krankenhaus – Arzt, Bett, Spritze, weiß, Patient",
        "definition": "Ein weißer Komplex mit Betten und Nadeln, wo Kranke genesen.",
        "area": "TABU"
},
    {
        "term": "Krankenschwester – Spritze, Pflege, Krankenhaus, weiß, Patient",
        "definition": "Eine Pflegerin, die Verbände wechselt und Medikamente verteilt.",
        "area": "TABU"
},
    {
        "term": "Krone – König, Kopf, Gold, Juwelen, Herrscher",
        "definition": "Ein kreisförmiges Diadem mit Edelsteinen, das auf dem Haupt thront.",
        "area": "TABU"
},
    {
        "term": "Kuchen – Backen, Sahne, Kerze, Geburtstag, süß",
        "definition": "Ein weicher, geschichteter Teig mit Glasur, der bei Festen angeschnitten wird.",
        "area": "TABU"
},
    {
        "term": "Känguru – Beutel, springen, Australien, hüpfen, Tier",
        "definition": "Ein marsupiales Sprungtier mit einem Behältnis für die Jungen und starken Hinterbeinen.",
        "area": "TABU"
},
    {
        "term": "Kürbis – Halloween, orange, Gesicht, geschnitzt, Laterne",
        "definition": "Eine runde Kürbiskugel mit ausgehöhltem Grinsen als Leuchte.",
        "area": "TABU"
},
    {
        "term": "Lampe – Licht, Glühbirne, Schalter, Tisch, dunkel",
        "definition": "Ein strahlendes Objekt mit Faden, das Räume erhellt, wenn es angeschaltet wird.",
        "area": "TABU"
},
    {
        "term": "Lehrer – Schule, Tafel, Buch, Note, Unterricht",
        "definition": "Ein Wissensvermittler, der vor einer Gruppe steht und Erklärungen gibt.",
        "area": "TABU"
},
    {
        "term": "Löwe – Mähne, König, brüllen, Savanne, Raubtier",
        "definition": "Ein majestätisches Großkatze mit buschigem Kopfschmuck und einem donnernden Ruf.",
        "area": "TABU"
},
    {
        "term": "Mond – Nacht, rund, silbern, Krater, Gezeiten",
        "definition": "Der ferne, leuchtende Begleiter der Erde, der Phasen durchläuft und Nächte erhellt.",
        "area": "TABU"
},
    {
        "term": "Museum – Kunst, Bild, Statue, alt, Geschichte",
        "definition": "Ein Hort vergangener Schätze mit Leinwänden, Figuren und Relikten.",
        "area": "TABU"
},
    {
        "term": "Musik – hören, Lied, Instrument, Kopfhörer, Konzert",
        "definition": "Klangwellen in harmonischen Mustern, die Ohren erfreuen.",
        "area": "TABU"
},
    {
        "term": "Osterhase – Ei, Karotte, verstecken, Frühling, Fell",
        "definition": "Ein hoppelnder Langohr mit weichem Pelz, der Eier versteckt.",
        "area": "TABU"
},
    {
        "term": "Ozean – Wasser, tief, blau, Fisch, Welle",
        "definition": "Ein endloses Salzwasserbecken mit Wellen und Unterwassergeschöpfen.",
        "area": "TABU"
},
    {
        "term": "Park – Baum, Bank, Gras, Spazieren, See",
        "definition": "Ein grünes Fleckchen mit Sitzgelegenheiten, Wegen und einem Teich.",
        "area": "TABU"
},
    {
        "term": "Pilot – Flugzeug, Cockpit, Himmel, Flughafen, Uniform",
        "definition": "Ein Steuermann im vorderen Abteil, der Kurse durch die Wolken navigiert.",
        "area": "TABU"
},
    {
        "term": "Pinguin – Eis, schwarz-weiß, Antarktis, watscheln, Fisch",
        "definition": "Ein flugunfähiges Vogelwesen in Kontrastfarben, das auf dem gefrorener Untergrund balanciert und taucht.",
        "area": "TABU"
},
    {
        "term": "Pirat – Schiff, Papagei, Schatz, Säbel, Auge",
        "definition": "Ein Seeräuber mit Augenklappe und Hakenhand, der Schätze jagt.",
        "area": "TABU"
},
    {
        "term": "Pizza – Käse, Teig, Tomate, Italien, rund",
        "definition": "Eine flache, knusprige Scheibe mit Belägen aus Sauce und geschmolzenen Zutaten.",
        "area": "TABU"
},
    {
        "term": "Polizist – Uniform, Pistole, Handschellen, Auto, Gesetz",
        "definition": "Ein Ordnungshüter in blauer Kluft, der Verkehrsregeln durchsetzt.",
        "area": "TABU"
},
    {
        "term": "Prinzessin – Kleid, Krone, Schloss, Märchen, schön",
        "definition": "Eine adlige Dame in fließendem Gewand, die in einem Turm wartet.",
        "area": "TABU"
},
    {
        "term": "Rakete – Weltraum, Start, Feuer, Mond, Astronaut",
        "definition": "Ein zylinderförmiges Fahrzeug, das mit Gasstrahlen in die Höhe schießt.",
        "area": "TABU"
},
    {
        "term": "Regenbogen – Regen, Farben, Himmel, Bogen, sieben",
        "definition": "Ein buntes Lichtbogen nach dem Schauer, das den Horizont spannt.",
        "area": "TABU"
},
    {
        "term": "Regenschirm – Regen, nass, aufspannen, Stock, Schutz",
        "definition": "Ein faltbares Gestell mit Stoff, das man über den Kopf hält, um vor Nässe bewahrt zu werden.",
        "area": "TABU"
},
    {
        "term": "Ritter – Schwert, Rüstung, Pferd, Burg, Held",
        "definition": "Ein gepanzerter Krieger mit Lanze, der für Ehre kämpft.",
        "area": "TABU"
},
    {
        "term": "Schiff – Wasser, Kapitän, Meer, Anker, Boot",
        "definition": "Ein schwimmendes Gefährt mit Decks, das über Ozeane segelt.",
        "area": "TABU"
},
    {
        "term": "Schloss – König, Turm, Burg, Märchen, Stein",
        "definition": "Eine massive Festung mit Zinnen und Türmen aus hartem Gestein.",
        "area": "TABU"
},
    {
        "term": "Schneemann – Karotte, Schnee, Hut, Winter, Frost",
        "definition": "Eine aufgetürmte Schneefigur mit orangener Nase und altem Filzhut.",
        "area": "TABU"
},
    {
        "term": "Schokolade – braun, süß, Kakao, Tafel, Milch",
        "definition": "Eine cremige Süßigkeit aus fermentierten Samen, die schmilzt auf der Zunge.",
        "area": "TABU"
},
    {
        "term": "Schule – Tafel, Buch, Lehrer, Schüler, Pausenhof",
        "definition": "Ein Ort des Lernens mit Kreidestücken, Bänden und spielenden Kindern.",
        "area": "TABU"
},
    {
        "term": "Smartphone – Handy, Touchscreen, App, Foto, Anruf",
        "definition": "Ein tragbares Gerät mit Glasoberfläche, das Nachrichten sendet und Bilder fängt.",
        "area": "TABU"
},
    {
        "term": "Sofa – Couch, Fernseher, weich, sitzen, Wohnzimmer",
        "definition": "Ein langes Polstermöbel, auf dem man ausgestreckt fernsieht.",
        "area": "TABU"
},
    {
        "term": "Sonne – heiß, Himmel, gelb, Tag, Licht",
        "definition": "Der strahlende Himmelskörper, der tagsüber den Firmament erhellt und Wärme spendet.",
        "area": "TABU"
},
    {
        "term": "Spiegel – Glas, reflektieren, Bad, Gesicht, sehen",
        "definition": "Eine glatte Fläche, die das Ebenbild zurückwirft und das Aussehen zeigt.",
        "area": "TABU"
},
    {
        "term": "Stadt – Gebäude, Straße, Auto, Mensch, Lichter",
        "definition": "Ein Gewirr aus Hochhäusern, belebten Wegen und nächtlichem Glanz.",
        "area": "TABU"
},
    {
        "term": "Stern – Himmel, Nacht, funkeln, Licht, weit",
        "definition": "Ein ferner Lichtpunkt, der in der Finsternis zwinkert.",
        "area": "TABU"
},
    {
        "term": "Strand – Sand, Meer, Sonne, Handtuch, Welle",
        "definition": "Ein Streifen feinen Kies am Wasserrand mit Sonnenschein und Brandung.",
        "area": "TABU"
},
    {
        "term": "Student – Uni, Vorlesung, Prüfung, Party, Bibliothek",
        "definition": "Ein Lernender an der Hochschule, der Notizen macht und Abschlussarbeiten schreibt.",
        "area": "TABU"
},
    {
        "term": "Stuhl – sitzen, vier Beine, Rückenlehne, Tisch, Holz",
        "definition": "Ein Sitzmöbel mit Lehne und Beinen, das am Esstisch steht.",
        "area": "TABU"
},
    {
        "term": "Sushi – Fisch, Reis, roh, Japan, Stäbchen",
        "definition": "Kleine Rollen aus klebrigem Korn mit Meeresfrüchten, die mit Esswerkzeugen genossen werden.",
        "area": "TABU"
},
    {
        "term": "Teddybär – Kuscheltier, Plüsch, Braun, Bett, Kind",
        "definition": "Ein weiches Stofftier mit runden Ohren und Knopfenaugen für Kinder.",
        "area": "TABU"
},
    {
        "term": "Teppich – Boden, weich, Farbe, Wohnzimmer, saugen",
        "definition": "Ein textiler Belag für den Fußboden, der Wärme und Muster spendet.",
        "area": "TABU"
},
    {
        "term": "Tisch – essen, vier Beine, Holz, Platte, Stuhl",
        "definition": "Eine ebene Fläche auf Stützen, auf der Mahlzeiten eingenommen werden.",
        "area": "TABU"
},
    {
        "term": "Trommel – Schlagzeug, Rhythmus, Sticks, Schlag, Laut",
        "definition": "Ein hohles Schlaginstrument, das durch Hämmern rhythmische Töne erzeugt.",
        "area": "TABU"
},
    {
        "term": "Tür – Schloss, Griff, offen, Zimmer, schließen",
        "definition": "Ein bewegliches Panel, das Eingänge versperrt oder freigibt.",
        "area": "TABU"
},
    {
        "term": "Uhr – Zeit, Zeiger, Armband, tickt, Stunde",
        "definition": "Ein mechanisches Gerät mit Nadeln, das Minuten und Stunden anzeigt.",
        "area": "TABU"
},
    {
        "term": "Vampir – Blut, Zähne, Nacht, Dracula, Knoblauch",
        "definition": "Ein untoter Wanderer der Dunkelheit mit spitzen Eckzähnen und bleicher Haut.",
        "area": "TABU"
},
    {
        "term": "Vulkan – Lava, Feuer, Berg, Rauch, Ausbruch",
        "definition": "Ein rauchender Krater, aus dem glühende Flüssigkeit quillt.",
        "area": "TABU"
},
    {
        "term": "Wald – Baum, grün, Vogel, Laub, Natur",
        "definition": "Ein dichtes Gewirr aus Stämmen und Blättern, bevölkert von Singvögeln.",
        "area": "TABU"
},
    {
        "term": "Weihnachtsbaum – Kugeln, Lichter, Geschenke, Tannen, Stern",
        "definition": "Ein immergrüner Nadelbaum, geschmückt mit Glanz und Leuchten.",
        "area": "TABU"
},
    {
        "term": "Wein – Traube, Flasche, Korken, Rot, Weiß",
        "definition": "Ein gärendes Saft aus Beeren, das in einer Glasflasche mit Pfropfen lagert.",
        "area": "TABU"
},
    {
        "term": "Wolke – Himmel, weiß, Regen, flauschig, hoch",
        "definition": "Eine watteweiße Masse, die am Firmament schwebt und Wasser trägt.",
        "area": "TABU"
},
    {
        "term": "Wüste – Sand, heiß, Kaktus, Kamel, trocken",
        "definition": "Ein weites Sandmeer mit stacheligen Pflanzen und Buckeltieren.",
        "area": "TABU"
},
    {
        "term": "Zahnarzt – Bohren, Schmerz, Mund, Zahn, Stuhl",
        "definition": "Ein Spezialist, der mit Werkzeugen im Gebiss arbeitet und es reinigt.",
        "area": "TABU"
},
    {
        "term": "Zauberstab – Magie, Harry, Holz, Sprüche, Zauberei",
        "definition": "Ein schlanker Stab aus Material, der mit Gesten Wunder bewirkt.",
        "area": "TABU"
},
    {
        "term": "Zoo – Tier, Käfig, Affe, Löwe, Elefant",
        "definition": "Ein Park mit eingezäunten Wildtieren aus aller Welt.",
        "area": "TABU"
},
    {
        "term": "Zug – Gleis, Bahnhof, Lokomotive, Wagen, Schiene",
        "definition": "Ein lange Kette von Waggons, die auf Schienen durch das Land zieht.",
        "area": "TABU"
}
];

import type { Translations } from '../types';

// PLACEHOLDER TRANSLATIONS, DO NOT MACHINE-TRANSLATE: Impressum (§ 18 MStV, § 5 DDG) and Datenschutzerklärung (Art. 12/13
// DSGVO) are legally binding in German. Every value except `backToHome` and `notConfigured` is deliberately identical to
// `../de/legal.ts`; replace only with a reviewed, legally checked English version, alongside the German one.

export const legal: Translations['legal'] = {
    // Navigational/structural labels — not part of the legally binding text.
    backToHome: 'Back to Examance',
    notConfigured: {
        strong: 'Operator details missing.',
        text: 'This build carries no operator details (VITE_LEGAL_*, see docs/deployment.md); the marked fields are placeholders.',
    },

    // Operator block shared by Impressum and Datenschutzerklärung; values come from the build (lib/legal/operator.ts).
    operator: {
        namePlaceholder: '[Name]',
        streetPlaceholder: '[Straße und Hausnummer]',
        postcodeCityPlaceholder: '[PLZ und Ort]',
        emailPlaceholder: '[E-Mail-Adresse]',
        country: 'Deutschland',
        emailLabel: 'E-Mail:',
        phoneLabel: 'Telefon:',
    },

    // PLACEHOLDER — German legal text. Do not machine-translate.
    impressum: {
        pageTitle: 'Impressum — Examance',
        title: 'Impressum',
        subtitle: 'Angaben nach § 18 Abs. 1 MStV und, soweit anwendbar, § 5 DDG',
        provider: {
            heading: 'Anbieter',
        },
        privacy: {
            heading: 'Datenschutz',
            textBefore: 'Informationen zur Verarbeitung personenbezogener Daten finden Sie in der',
            linkText: 'Datenschutzerklärung',
        },
    },

    // PLACEHOLDER — German legal text. Do not machine-translate.
    datenschutz: {
        pageTitle: 'Datenschutzerklärung — Examance',
        title: 'Datenschutzerklärung',
        subtitle: 'Informationen nach Art. 13 DSGVO',
        section1: {
            heading: '1. Verantwortlicher',
            text: 'Verantwortlich für die Verarbeitung personenbezogener Daten auf dieser Website und dem zugehörigen Server ist:',
        },
        section2: {
            heading: '2. Aufruf der Website',
            para1: 'Die Weboberfläche wird über Cloudflare Pages ausgeliefert; Anfragen an den Server von Examance laufen ebenfalls über das Netz von Cloudflare. Anbieter ist die Cloudflare, Inc., USA, die als Auftragsverarbeiter tätig ist (Art. 28 DSGVO). Die Übermittlung in die USA stützt sich auf den Angemessenheitsbeschluss zum EU-U.S. Data Privacy Framework (Art. 45 DSGVO).',
            para2: 'Bei jedem Aufruf werden technisch notwendige Verbindungsdaten verarbeitet: IP-Adresse, Zeitpunkt, aufgerufene Adresse, Statuscode und Browserkennung. Der Server nutzt die IP-Adresse außerdem, um die Zahl der Anfragen zu begrenzen, und schreibt Anfragen (IP-Adresse, Zeitpunkt, Anfrage, Statuscode) in ein technisches Protokoll zur Fehlersuche. Bei sicherheitsrelevanten Kontoaktionen wie Anmeldung, Passwortänderung, Export oder Löschung speichert er einen Hashwert der IP-Adresse im Sicherheitsprotokoll.',
            para3: 'Zweck ist die sichere und stabile Bereitstellung des Dienstes; Rechtsgrundlage ist das berechtigte Interesse des Betreibers daran (Art. 6 Abs. 1 lit. f DSGVO).',
        },
        section3: {
            heading: '3. Nutzerkonto',
            para1: 'Examance richtet sich an Lehrkräfte. Ein Konto entsteht auf Einladung der Administration oder durch Registrierung: Nach Bestätigung der E-Mail-Adresse über einen zugesandten Link und Festlegen eines Passworts gibt die Administration das Konto frei, für bestimmte E-Mail-Domains automatisch. Bis zur Entscheidung sieht die Administration die E-Mail-Adresse und eine freiwillige Nachricht; ein abgelehnter Antrag wird gelöscht.',
            para2: 'Gespeichert werden E-Mail-Adresse, Rolle, ein Hashwert des Passworts, die Anmeldefaktoren (öffentliche Schlüssel von Passkeys, verschlüsseltes Geheimnis für Einmalcodes, Hashwerte von Wiederherstellungscodes), der verschlüsselte Datenschlüssel, Kontoeinstellungen wie Speichermodus und freigeschaltete Funktionen sowie Zeitpunkte wie Erstellung, Freigabe und letzte Nutzung eines Anmeldefaktors. Das Sicherheitsprotokoll enthält E-Mail-Adresse, Aktion, Zeitpunkt und Hashwerte der IP-Adresse und des betroffenen Objekts.',
            para3: 'Rechtsgrundlage ist die Bereitstellung des Dienstes auf Ihren Wunsch (Art. 6 Abs. 1 lit. b DSGVO), für das Sicherheitsprotokoll das berechtigte Interesse an der Sicherheit der Konten (Art. 6 Abs. 1 lit. f DSGVO).',
        },
        section4: {
            heading: '4. Prüfungen und Schülerdaten',
            para1: 'Prüfungen und Aufgaben (Texte, Dateien und Angaben wie Titel, Klasse, Fach, Datum oder Name der Lehrkraft) werden unverschlüsselt auf dem Server gespeichert; Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.',
            para2: 'Identitäten von Schülerinnen und Schülern, Scans, Korrekturanmerkungen und Punktzahlen je Aufgabe werden bereits im Browser verschlüsselt (AES-256-GCM); den Schlüssel erhält der Server nie. Je Konto gilt einer von zwei Speichermodi: Im Modus „all-server“ liegen diese Daten verschlüsselt auf dem Server, dazu unverschlüsselt die Gesamtpunktzahl je Pseudonym für die Statistik. Im Modus „hybrid“ bleiben sie verschlüsselt im Browser (IndexedDB) und werden nicht an den Server übertragen.',
            para3: 'Für Schülerdaten ist die Lehrkraft bzw. ihre Schule verantwortlich. Der Betreiber stellt dafür nur die technische Plattform bereit, kann die im Browser verschlüsselten Inhalte nicht lesen und nutzt die Daten nicht für eigene Zwecke; einen Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO) können Schulen beim Betreiber anfordern. Schülerinnen, Schüler und Eltern wenden sich mit Anfragen bitte an die Lehrkraft bzw. die Schule.',
        },
        section5: {
            heading: '5. Freiwillige Funktionen',
            intro: 'Die folgenden Funktionen sind ausgeschaltet, bis Sie sie nutzen, und beruhen auf Ihrer Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Sie können die Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO).',
            sharingLabel: 'Teilen von Aufgaben:',
            sharingText: 'Teilen Sie eine Aufgabe, sind ihr Inhalt, ihre Dateien und Ihre E-Mail-Adresse für die anderen Konten dieser Installation sichtbar. Sie widerrufen, indem Sie das Teilen beenden; bereits erstellte Kopien bleiben bei den jeweiligen Konten. Schlagen Sie Änderungen an einer geteilten Aufgabe vor, sieht die teilende Lehrkraft den Vorschlag und Ihre E-Mail-Adresse und erhält eine E-Mail-Benachrichtigung ohne Inhalt.',
            donationLabel: 'Spende von Ankreuzfeld-Ausschnitten:',
            donationText: 'Sie können in den Einstellungen Ausschnitte bereits geprüfter Multiple-Choice-Kästchen an den Betreiber senden, um die automatische Erkennung zu verbessern. Übermittelt werden je Kästchen nur ein kleiner Graustufen-Ausschnitt ohne Aufgabentext, Ihre geprüfte Entscheidung, technische Messwerte und eine zufällige Kennung, aber keine Namen, Pseudonyme, Kennungen von Prüfungen oder Abgaben und keine Zeitstempel. Die Ausschnitte werden ohne Bezug zu Ihrem Konto gespeichert; das Konto dient nur einem Tageskontingent, dessen Zähler (Hashwert der Kontokennung) nach 24 Stunden verfällt. Nach dem Widerruf in den Einstellungen wird nichts mehr gesendet; bereits gespendete Ausschnitte lassen sich niemandem zuordnen und daher nicht gezielt löschen.',
        },
        section6: {
            heading: '6. E-Mail-Versand',
            text: 'Für E-Mails wie Bestätigungs- und Einladungslinks, das Zurücksetzen des Passworts, die Bestätigung einer Kontolöschung und Benachrichtigungen nutzt der Betreiber einen E-Mail-Dienstleister als Auftragsverarbeiter (Art. 28 DSGVO). Verarbeitet werden E-Mail-Adresse und Inhalt der Nachricht; Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.',
        },
        section7: {
            heading: '7. Fehlerbilder von http.cat',
            text: 'Zeigt die Anwendung eine HTTP-Fehlermeldung an, lädt Ihr Browser ein passendes Bild vom Dienst http.cat (Betreiber in den USA). Examance gibt dabei nur den Statuscode des Fehlers weiter, keine Herkunftsadresse und keine Inhalte der Anwendung; der Anbieter erhält wie bei jedem Abruf Ihre IP-Adresse und Browserkennung. Ob für den Anbieter ein Angemessenheitsbeschluss (Art. 45 DSGVO) gilt, ist dem Betreiber nicht bekannt; geeignete Garantien (Art. 46 DSGVO) bestehen nicht. Rechtsgrundlage ist das berechtigte Interesse an einer verständlichen Fehleranzeige (Art. 6 Abs. 1 lit. f DSGVO).',
        },
        section8: {
            heading: '8. Cookies und Speicher im Browser',
            text: 'Examance speichert im Browser nur, was für den Dienst technisch erforderlich ist (§ 25 Abs. 2 Nr. 2 TDDDG): Anmelde-Cookies des Servers, Einstellungen wie Sprache und Darstellung, noch nicht an den Server übertragene Änderungen, den Sitzungsschlüssel für die Dauer der Sitzung und den verschlüsselten Datenspeicher (IndexedDB). Es gibt kein Tracking und keine Analyse- oder Werbedienste.',
        },
        section9: {
            heading: '9. Speicherdauer',
            intro: 'Personenbezogene Daten werden gelöscht, sobald sie für ihren Zweck nicht mehr erforderlich sind:',
            account: 'Kontodaten, Prüfungen und Aufgaben: bis zur Löschung des Kontos, die Sie in den Einstellungen auslösen können.',
            students: 'Schülerdaten und Abgaben auf dem Server: bis zu dem Aufbewahrungsdatum, das die Lehrkraft je Prüfung festlegt, oder bis zu ihrer Löschung; danach endgültig nach einer Übergangsfrist von {graceDays} Tagen.',
            registration: 'Unbestätigte Registrierungen spätestens einen Tag nach Ablauf des {registrationLinkHours} Stunden gültigen Bestätigungslinks, nicht freigegebene Konten nach {pendingAccountDays} Tagen, abgelehnte Anträge sofort.',
            auditLog: 'Sicherheitsprotokoll: {auditLogDays} Tage.',
            contributions: 'Änderungsvorschläge: der Inhalt mit der Entscheidung, der Eintrag {contributionDays} Tage danach; unentschiedene Vorschläge nach {contributionPendingDays} Tagen.',
            donation: 'Gespendete Ankreuzfeld-Ausschnitte: {trainingSampleDays} Tage.',
            fallback: 'Die genauen Fristen legt der Server dieser Installation fest; sie erscheinen hier, sobald er erreichbar ist. Schülerdaten werden nach Ablauf des von der Lehrkraft festgelegten Aufbewahrungsdatums gelöscht; unbestätigte Registrierungen, nicht freigegebene Konten, das Sicherheitsprotokoll, Änderungsvorschläge und gespendete Ausschnitte nach festen Fristen.',
            counters: 'Zähler zur Begrenzung von Anfragen und Anmeldeversuchen: höchstens eine Stunde.',
            serverLog: 'Technisches Protokoll des Servers: bis zur nächsten Aktualisierung des Servers.',
            browser: 'Daten im Browser: bis Sie sie in der Anwendung oder im Browser löschen; der Sitzungsschlüssel endet mit der Sitzung.',
        },
        section10: {
            heading: '10. Ihre Rechte',
            para1: 'Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21, siehe unten). Eine Einwilligung können Sie jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3). Wenden Sie sich dazu an den Verantwortlichen (Abschnitt 1).',
            objection: 'Widerspruchsrecht: Soweit der Betreiber Daten auf Grundlage berechtigter Interessen verarbeitet (Art. 6 Abs. 1 lit. f DSGVO, Abschnitte 2, 3 und 7), können Sie dem aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit widersprechen (Art. 21 Abs. 1 DSGVO). Die Daten werden dann nicht mehr verarbeitet, es sei denn, es bestehen zwingende schutzwürdige Gründe, die Ihre Interessen überwiegen, oder die Verarbeitung dient der Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen.',
            para2: 'Sie können sich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO).',
        },
        section11: {
            heading: '11. Weitere Hinweise',
            para1: 'Ohne E-Mail-Adresse und Anmeldefaktoren kann kein Konto eingerichtet und Examance nicht genutzt werden; eine gesetzliche Pflicht, diese Daten bereitzustellen, besteht nicht.',
            para2: 'Eine automatisierte Entscheidungsfindung nach Art. 22 DSGVO findet nicht statt: Die automatische Erkennung von Ankreuzungen unterstützt die Lehrkraft nur, die Bewertung legt die Lehrkraft fest.',
        },
    },
};

import type { Translations } from '../types';

// -----------------------------------------------------------------------------
// PLACEHOLDER TRANSLATIONS — DO NOT MACHINE-TRANSLATE.
// Impressum (§ 5 DDG) and Datenschutzerklärung (Art. 12/13 DSGVO) are legally binding in German.
// Every value except `backToHome` is deliberately identical to `../de/legal.ts`, not an English
// translation. Replace only with a reviewed, legally-checked English version, alongside the German one.
// -----------------------------------------------------------------------------

export const legal: Translations['legal'] = {
    // Navigational/structural label — not part of the legally binding text.
    backToHome: 'Back to Examance',

    // PLACEHOLDER — German legal text (Impressum, § 5 DDG). Do not machine-translate.
    impressum: {
        pageTitle: 'Impressum — Examance',
        title: 'Impressum',
        subtitle: 'Anbieterkennzeichnung nach § 5 DDG',
        todoBanner: {
            strong: 'Vor dem Produktivbetrieb ausfüllen.',
            text: 'Die markierten Felder müssen durch die Angaben des tatsächlichen Betreibers ersetzt werden. Ein unvollständiges Impressum ist abmahnfähig.',
        },
        provider: {
            heading: 'Diensteanbieter',
            namePlaceholder: '[Name der Schule / des Schulträgers]',
            streetPlaceholder: '[Straße und Hausnummer]',
            cityPlaceholder: '[PLZ und Ort]',
            country: 'Deutschland',
        },
        representative: {
            heading: 'Vertretungsberechtigt',
            namePlaceholder: '[Name der Schulleitung bzw. der vertretungsberechtigten Person]',
        },
        contact: {
            heading: 'Kontakt',
            phoneLabel: 'Telefon:',
            phonePlaceholder: '[Telefonnummer]',
            emailLabel: 'E-Mail:',
            emailPlaceholder: '[E-Mail-Adresse]',
        },
        authority: {
            heading: 'Zuständige Aufsichtsbehörde',
            placeholder: '[Zuständiges Staatliches Schulamt / Ministerium]',
        },
        responsible: {
            heading: 'Verantwortlich für den Inhalt',
            placeholder: '[Name, Anschrift]',
        },
        privacy: {
            heading: 'Datenschutz',
            textBefore: 'Informationen zur Verarbeitung personenbezogener Daten finden Sie in der',
            linkText: 'Datenschutzerklärung',
        },
    },

    // PLACEHOLDER — German legal text (Datenschutzerklärung, Art. 12/13 DSGVO). Do not machine-translate.
    datenschutz: {
        pageTitle: 'Datenschutzerklärung — Examance',
        title: 'Datenschutzerklärung',
        subtitle: 'Informationen nach Art. 13 und 14 DSGVO',
        todoBanner: {
            strong: 'Vor dem Produktivbetrieb ausfüllen und rechtlich prüfen lassen.',
            text: 'Die markierten Felder sind betreiberspezifisch. Die Rechtsgrundlage und die Aufbewahrungsfristen richten sich nach dem Schulrecht des jeweiligen Landes — siehe',
        },
        section1: {
            heading: '1. Verantwortlicher',
            text: '[Name und Anschrift der Schule als verantwortliche Stelle]',
        },
        section2: {
            heading: '2. Datenschutzbeauftragte / Datenschutzbeauftragter',
            text: '[Name, Anschrift, E-Mail]',
        },
        section3: {
            heading: '3. Zwecke und Rechtsgrundlage der Verarbeitung',
            para1Before: 'Examance wird zur Erstellung, Durchführung und Bewertung schriftlicher Leistungsnachweise eingesetzt. Die Verarbeitung erfolgt zur Wahrnehmung einer Aufgabe, die im öffentlichen Interesse liegt bzw. in Ausübung öffentlicher Gewalt (Art. 6 Abs. 1 lit. e DSGVO) in Verbindung mit',
            para1Placeholder: '[landesrechtliche Grundlage, in Bayern z. B. Art. 85 BayEUG i. V. m. BaySchO]',
            para2: 'Eine Einwilligung wird für diese Verarbeitung nicht eingeholt und ist nicht erforderlich; ein Widerruf ist daher nicht vorgesehen.',
        },
        section4: {
            heading: '4. Kategorien personenbezogener Daten',
            li1: 'Bei Schülerinnen und Schülern: Name, Kennnummer, abgegebene Prüfungsarbeit (Scan), Korrekturanmerkungen, erreichte Punktzahl.',
            li2: 'Bei Lehrkräften: E-Mail-Adresse, Rolle, Zeitpunkt der Freigabe des Kontos, die von der Administration freigeschalteten Funktionen, Zeitpunkte von Anmeldungen und Exporten, gekürzter Hashwert der IP-Adresse.',
            li3: 'Bei Personen, die ein Konto beantragen: E-Mail-Adresse und ein Hashwert des Bestätigungslinks, bis die Adresse bestätigt ist; danach der Hashwert des gewählten Passworts und eine freiwillige Nachricht an die Administration, bis über die Freigabe entschieden ist.',
        },
        section5: {
            heading: '5. Verschlüsselung und Speicherort',
            para1Before: 'Zur Nutzung ist ein Konto auf dem Examance-Server erforderlich. Der Datenschlüssel wird im Browser aus dem Schlüsselumschlag des Kontos (Passwort, Passkey oder Wiederherstellungscode) abgeleitet; der Server erhält ihn nie. Identitätsdaten, Scans und Korrekturanmerkungen werden bereits im Browser verschlüsselt (AES-256-GCM), bevor sie gespeichert oder übertragen werden. Der Server erhält diese Inhalte ausschließlich als Chiffrat und besitzt den Schlüssel nicht. Die Lehrkraft wählt je Konto beim ersten Anmelden ausdrücklich einen von zwei Speichermodi. Im Modus (',
            para1Emphasis: 'all-server',
            para1After: ') werden Identitäten, Scans, Korrekturanmerkungen und Punktzahlen je Aufgabe als Chiffrat auf dem Server gespeichert. Im Modus „hybrid“ verbleiben Schülerdaten, Scans und Punktzahlen ausschließlich im verschlüsselten Browserspeicher (IndexedDB) des Geräts, auf dem sie erfasst wurden, und werden nicht an den Server übertragen. Prüfungen und Aufgaben (LaTeX-Quelltext, Ressourcendateien) liegen in beiden Modi unverschlüsselt auf dem Server. Beim Wechsel des Modus werden die Ergebnisse zwischen Server und Browser verschoben; das Löschen der bisherigen Kopie ist optional (vorläufiges Löschen mit 7 Tagen Karenzzeit). Die optionale serverseitige LaTeX-Kompilierung arbeitet zustandslos (temporäres Verzeichnis, keine Speicherung, keine Schülerdaten). Ein früherer rein lokaler Modus ohne Konto wird nicht mehr angeboten; ältere lokale Browserdaten können nicht mehr geöffnet und nur noch gelöscht werden.',
            para3: 'Ausnahme: die freiwillige Spende anonymisierter Ankreuzfeld-Ausschnitte (Abschnitt 10), sofern die Lehrkraft sie aktiviert hat.',
            para2: 'Nicht verschlüsselt gespeichert werden serverseitig: die Gesamtpunktzahl je Pseudonym (nur im Modus all-server) sowie Prüfungs- und Aufgabeninhalte und Metadaten der Prüfung (Titel, Klasse, Fach, Datum). Pseudonymisierte Daten bleiben personenbezogene Daten im Sinne des Erwägungsgrundes 26 DSGVO.',
        },
        section6: {
            heading: '6. Empfänger und Auftragsverarbeiter',
            hostingWebLabel: 'Hosting der Weboberfläche:',
            hostingWebPlaceholder: '[Cloudflare Pages, Cloudflare Inc., USA — Angemessenheitsbeschluss / Standardvertragsklauseln prüfen]',
            hostingDbLabel: 'Hosting von Datenbank und Cache:',
            hostingDbPlaceholder: '[Anbieter, Standort]',
            mailLabel: 'E-Mail-Versand:',
            mailText: 'Bestätigungslinks, Einladungen, Links zum Zurücksetzen des Passworts sowie Benachrichtigungen über Freigabe oder Ablehnung werden per E-Mail versandt über',
            mailPlaceholder: '[E-Mail-Versanddienst, Anbieter, Standort]',
            httpCatLabel: 'Fehlerbilder:',
            httpCatText: 'Zeigt die Anwendung eine HTTP-Fehlermeldung an, lädt der Browser ein illustrierendes Bild vom Dienst http.cat (Betreiber in den USA). Dabei werden ausschließlich Ihre IP-Adresse, die Browserkennung (User-Agent) und der HTTP-Statuscode des Fehlers übermittelt; es werden weder Referrer noch Cookies oder Inhalte der Anwendung gesendet. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO.',
        },
        section7: {
            heading: '7. Speicherdauer',
            textBefore: 'Für jede Prüfung wird ein Aufbewahrungsdatum festgelegt. Nach dessen Ablauf werden Identitätsdaten und Abgaben nach einer Übergangsfrist von',
            gracePlaceholder: '[RETENTION_GRACE_DAYS]',
            textMiddle: 'Tagen unwiderruflich gelöscht. Protokolldaten werden nach',
            auditPlaceholder: '[AUDIT_LOG_RETENTION_DAYS]',
            textEnd: 'Tagen gelöscht. Gesetzliche Aufbewahrungsfristen für Leistungsnachweise bleiben unberührt.',
            registrationBefore: 'Nicht bestätigte Kontoanträge werden nach',
            registrationTtlPlaceholder: '[REGISTRATION_TOKEN_TTL_HOURS]',
            registrationMiddle: 'Stunden gelöscht, nicht freigegebene Konten nach',
            pendingPlaceholder: '[PENDING_ACCOUNT_RETENTION_DAYS]',
            registrationEnd: 'Tagen. Ein abgelehnter Antrag wird sofort gelöscht; die Nachricht an die Administration wird mit der Freigabe gelöscht.',
        },
        section8: {
            heading: '8. Ihre Rechte',
            text: 'Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) sowie Widerspruch gegen die Verarbeitung (Art. 21). Wenden Sie sich dafür an die oben genannte verantwortliche Stelle.',
        },
        section9: {
            heading: '9. Beschwerderecht',
            textBefore: 'Sie können sich bei einer Aufsichtsbehörde beschweren. Für bayerische öffentliche Schulen ist dies der Bayerische Landesbeauftragte für den Datenschutz (BayLfD), Wagmüllerstraße 18, 80538 München. In anderen Ländern ist die jeweils für öffentliche Stellen zuständige Aufsichtsbehörde einschlägig:',
            placeholder: '[zuständige Aufsichtsbehörde]',
        },
        section10: {
            heading: '10. Freiwillige Spende anonymisierter Ankreuzfeld-Ausschnitte',
            para1: 'Lehrkräfte können in den Einstellungen freiwillig (Opt-in, standardmäßig deaktiviert) einwilligen, zur Verbesserung der automatischen Erkennung von Ankreuzfeldern Ausschnitte bereits von ihnen geprüfter Multiple-Choice-Kästchen an den Betreiber dieses Examance-Servers zu senden.',
            para2: 'Übermittelt werden je Kästchen ausschließlich: ein kleiner Graustufen-Ausschnitt des Kästchens und des danebenliegenden Korrekturfelds (ohne Aufgabentext), die von der Lehrkraft geprüfte Entscheidung „angekreuzt / nicht angekreuzt“ sowie technische Messwerte der Erkennung. Nicht übermittelt werden Namen, Pseudonyme, Kennungen von Prüfung, Abgabe oder Aufgabe oder Zeitstempel; je Kästchen wird lediglich eine zufällig erzeugte Kennung übertragen, damit eine spätere Korrektur der Lehrkraft die frühere Wertung ersetzt. Die Übermittlung erfolgt nur mit angemeldetem Konto, damit ausschließlich Konten dieser Installation spenden können; das Konto wird dabei nicht mit den Ausschnitten gespeichert, sondern nur für ein Tageskontingent verwendet, dessen Zähler (Hashwert der Kontokennung) nach 24 Stunden verfällt. IP-Adressen werden nicht zusammen mit den Ausschnitten gespeichert. Die Ausschnitte werden vor der Übertragung im Browser anonymisiert und auf dem Server ohne Bezug zu Personen gespeichert.',
            para3Before: 'Die Ausschnitte werden ausschließlich zum Trainieren und Bewerten des Erkennungsverfahrens verwendet und nach',
            retentionPlaceholder: '[TRAINING_SAMPLE_RETENTION_DAYS]',
            para3After: 'Tagen gelöscht. Die Einwilligung kann jederzeit in den Einstellungen widerrufen werden; bereits übermittelte Ausschnitte können mangels Personenbezug nicht mehr einzelnen Personen zugeordnet und daher nicht gezielt gelöscht werden.',
            legalBasisPlaceholder: '[Rechtsgrundlage der Anonymisierung und Übermittlung durch die Schule / Lehrkraft — rechtlich prüfen]',
        },
        section11: {
            heading: '11. Registrierung eines Kontos',
            para1: 'Lehrkräfte können über „Konto beantragen“ selbst ein Konto beantragen. Dazu wird die angegebene E-Mail-Adresse gespeichert und ein Bestätigungslink an sie gesendet; vom Link wird nur ein Hashwert gespeichert. Ein Konto entsteht erst, wenn über diesen Link ein Passwort festgelegt wird. Die Anwendung gibt in keinem Schritt preis, ob für eine Adresse bereits ein Konto besteht; für bereits registrierte Adressen wird keine E-Mail versandt.',
            para2: 'Ein so angelegtes Konto kann erst genutzt werden, nachdem die Administration dieser Installation es freigegeben hat; stammt die Adresse von einer Domain, die die Administration als „immer erlaubt“ eingetragen hat, erfolgt die Freigabe automatisch. Die Administration sieht bis zur Entscheidung die E-Mail-Adresse und die freiwillige Nachricht. Lehnt sie den Antrag ab, wird das Konto gelöscht und die Person per E-Mail benachrichtigt.',
            para3: 'Personen, deren Konto noch nicht freigegeben ist, können die Auskunfts- und Löschfunktionen der Anwendung noch nicht nutzen; sie wenden sich für ihre Rechte nach Abschnitt 8 an die verantwortliche Stelle.',
            legalBasisPlaceholder: '[Rechtsgrundlage der Verarbeitung von Kontoanträgen — rechtlich prüfen]',
        },
    },
};

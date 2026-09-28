import type { Translations } from '../types';

// -----------------------------------------------------------------------------
// PLACEHOLDER TRANSLATIONS — DO NOT MACHINE-TRANSLATE.
//
// This namespace covers the Impressum (§ 5 DDG) and Datenschutzerklärung
// (Art. 12/13 DSGVO) pages. That text is legally mandated and legally binding
// in German. Every value below (except `backToHome`, a purely navigational
// label) is deliberately kept identical to the German source in
// `../de/legal.ts` — it is NOT an English translation, it is a placeholder.
// Do not run this file through machine translation and do not hand-translate
// it casually. It must only be replaced by a reviewed, legally-checked
// English translation of the Impressum/Datenschutzerklärung, produced
// alongside (not instead of) the authoritative German version.
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
            li2: 'Bei Lehrkräften: E-Mail-Adresse, Rolle, Zeitpunkte von Anmeldungen und Exporten, gekürzter Hashwert der IP-Adresse.',
        },
        section5: {
            heading: '5. Verschlüsselung und Speicherort',
            para1Before: 'Identitätsdaten, Scans und Korrekturanmerkungen werden bereits im Browser verschlüsselt (AES-256-GCM), bevor sie gespeichert oder übertragen werden. Der Server erhält diese Inhalte ausschließlich als Chiffrat und besitzt den Schlüssel nicht. Im Standardmodus (',
            para1Emphasis: 'local-only',
            para1After: ') verlassen die Daten das Gerät der Lehrkraft überhaupt nicht.',
            para3: 'Ausnahme: die freiwillige Spende anonymisierter Ankreuzfeld-Ausschnitte (Abschnitt 10), sofern die Lehrkraft sie aktiviert hat.',
            para2: 'Nicht verschlüsselt gespeichert werden serverseitig: die Gesamtpunktzahl je Pseudonym sowie Metadaten der Prüfung (Titel, Klasse, Fach, Datum). Pseudonymisierte Daten bleiben personenbezogene Daten im Sinne des Erwägungsgrundes 26 DSGVO.',
        },
        section6: {
            heading: '6. Empfänger und Auftragsverarbeiter',
            hostingWebLabel: 'Hosting der Weboberfläche:',
            hostingWebPlaceholder: '[Cloudflare Pages, Cloudflare Inc., USA — Angemessenheitsbeschluss / Standardvertragsklauseln prüfen]',
            hostingDbLabel: 'Hosting von Datenbank und Cache:',
            hostingDbPlaceholder: '[Anbieter, Standort]',
        },
        section7: {
            heading: '7. Speicherdauer',
            textBefore: 'Für jede Prüfung wird ein Aufbewahrungsdatum festgelegt. Nach dessen Ablauf werden Identitätsdaten und Abgaben nach einer Übergangsfrist von',
            gracePlaceholder: '[RETENTION_GRACE_DAYS]',
            textMiddle: 'Tagen unwiderruflich gelöscht. Protokolldaten werden nach',
            auditPlaceholder: '[AUDIT_LOG_RETENTION_DAYS]',
            textEnd: 'Tagen gelöscht. Gesetzliche Aufbewahrungsfristen für Leistungsnachweise bleiben unberührt.',
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
    },
};

# Hexplain — Rapport de Stage LaTeX

## 📁 Structure du projet

```
rapport/
├── main.tex                          ← Point d'entrée principal (compiler ce fichier)
├── preambule.tex                     ← Packages, couleurs, commandes personnalisées
├── pages_liminaires.tex              ← Page de garde, remerciements, résumés, TDM
├── bibliographie.bib                 ← Références bibliographiques (BibTeX)
├── chapitres/
│   ├── introduction.tex              ← Introduction générale
│   ├── chapitre1_organisme_accueil.tex ← Chap.1 : AIOX Labs
│   ├── chapitre2_contexte.tex        ← Chap.2 : Contexte, état de l'art, problématique
│   ├── chapitre3_conception.tex      ← Chap.3 : Besoins, UML, diagrammes
│   ├── chapitre4_architecture.tex    ← Chap.4 : Architecture technique, pipeline, sécurité
│   ├── chapitre5_realisation.tex     ← Chap.5 : Réalisation, captures d'écran, tests
│   ├── chapitre6_perspectives.tex    ← Chap.6 : Bilan, limitations, perspectives
│   └── conclusion.tex               ← Conclusion générale
└── img/
    ├── aiox_labs_logo.png
    ├── ensa_logo.png
    ├── architecture_pipeline.png     ← Diagramme architecture globale
    ├── diagramme_cas_utilisation.png
    ├── diagramme_sequence_analyse.png
    ├── diagramme_sequence_rag.png
    ├── diagramme_classes.png
    ├── landing_page_hero.png
    ├── auth_login_page.png
    ├── upload_binary_interface.png
    ├── jobs_history_list.png
    ├── pipeline_live_progress.png
    ├── report_executive_summary.png
    ├── report_capa_iocs_sections.png
    ├── report_decompiled_functions_risk.png
    ├── rag_chat_session1.png
    ├── rag_chat_session2.png
    ├── function_disassembly_pseudocode.png
    ├── function_ai_explanation_drawer.png
    ├── section_detail_ai_drawer.png
    ├── section_idata_detail.png
    └── pdf_export_report.png
```

## ⚙️ Compilation sur Overleaf

### Paramètres Overleaf requis
1. **Compiler** : `pdfLaTeX`
2. **Bibliography** : `Biber` (pas BibTeX)
3. **Main document** : `main.tex`

### Ordre de compilation (si en local)
```bash
pdflatex main.tex
biber main
makeglossaries main
pdflatex main.tex
pdflatex main.tex
```

> Sur Overleaf, tout est automatique — cliquer simplement sur **Recompile**.

## ⚠️ Placeholders à compléter

Rechercher `\placeholder` dans le code pour trouver les sections à remplir :
- Chapitre 1 : nombre exact d'employés AIOX Labs à la date du stage
- Chapitre 6 : nombre de lignes de code (lancer `cloc` sur le dépôt)

## 🔒 Règles de sécurité

**Ne jamais ajouter dans le rapport :**
- Clés API (Groq, Gemini, VirusTotal, OTX)
- Adresses IP de serveurs
- Mots de passe ou secrets de configuration
- URL cliquables vers des serveurs de déploiement actifs

## 📝 Infos du stage

| Champ | Valeur |
|---|---|
| Étudiant | AIT OIHMANE Lahsen |
| École | ENSA Marrakech — Filière GCDSTE |
| Organisme | AIOX Labs, Rabat, Maroc |
| Dates | 15/07/2025 — 10/09/2025 |
| Encadrant académique | Mme EL HALOUI |
| Encadrant professionnel | M. Imade Benelallam (CTO, AIOX Labs) |

# Owner: P0 (ARCHITECTURE.md §2) — Phase 1.
{
    'name': 'EcoSphere',
    'summary': 'ESG scoring, carbon accounting, engagement and gamification on native Odoo',
    'description': """
Single native Odoo addon on local PostgreSQL. Reuses the ERP as its data
source (hr, purchase, mrp, hr_expense, fleet, mail); the AI Copilot is the
only component that leaves the box, isolated behind a controller.
See ARCHITECTURE.md (build contract) and PLAN.md (binding delivery contract).
""",
    'version': '1.0.0',
    'category': 'Sustainability',
    'license': 'Other OSI approved licence',  # MIT — see LICENSE at repo root
    'author': 'EcoSphere Contributors',
    'application': True,
    'depends': [
        'hr',
        'purchase',
        'mrp',
        'hr_expense',
        'fleet',
        'mail',
        'product',
        'web',
    ],
    'data': [
        # security first: groups before ACLs, ACLs before anything that reads them
        'security/security_groups.xml',
        'security/access_common.csv',
        'security/access_carbon.csv',
        'security/access_social.csv',
        'security/access_governance.csv',
        'security/access_gamification.csv',
        'security/access_scoring.csv',
        'security/access_alerting.csv',
        # infrastructure data
        'data/ir_sequence.xml',
        'data/ir_cron_governance.xml',
        'data/ir_cron_scoring.xml',
        'data/ir_cron_alerting.xml',
        'data/emission_factor_data.xml',
        'data/mail_templates.xml',
        # views (menus carry the stable P0 anchor IDs — load first)
        'views/menus.xml',
        'views/carbon_views.xml',
        'views/environmental_views.xml',
        'views/social_views.xml',
        'views/governance_views.xml',
        'views/gamification_views.xml',
        'views/dashboard_views.xml',
        'views/alerting_views.xml',
        'views/report_builder_views.xml',
        'views/settings_views.xml',
        # reports
        'report/esg_reports.xml',
        'report/report_actions.xml',
    ],
    'demo': [
        'demo/demo_master.xml',
        'demo/demo_operations.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'ecosphere/static/src/scss/ecosphere_tokens.scss',
            'ecosphere/static/src/js/dashboard/**/*.js',
            'ecosphere/static/src/xml/dashboard_templates.xml',
        ],
    },
    'installable': True,
}

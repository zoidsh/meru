const EMAIL_TRACKERS: string[] = [
  // 365offers
  "trk\\.365offers\\.trade",
  // Absolutesoftware
  "click\\.absolutesoftware-email\\.com/open\\.aspx",
  // ActiveCampaign
  "lt\\.php(.*)\\?l=open",
  // ActionKit
  "track\\.sp\\.actionkit\\.com/q/",
  // Acoustic
  "mkt\\d{2,5}\\.(com|net)/open",
  // Adobe
  "demdex\\.net",
  "t\\.info\\.adobesystems\\.com",
  "toutapp\\.com",
  "/trk\\?t=",
  "sparkpostmail2\\.com",
  // Active
  "click\\.email\\.active\\.com/q",
  // AgileCRM
  "agle2\\.me/open",
  // Airbnb
  "email\\.airbnb\\.com/wf/open",
  "email\\.airbnbmail\\.com/wf/open",
  // AirMiles
  "email\\.airmiles\\.ca/O",
  // Alaska Airlines
  "click\\.points-mail\\.com/open",
  "sjv\\.io/i/",
  "gqco\\.net/i/",
  // Amazon
  "awstrack\\.me",
  "aws-track-email-open",
  "/gp/r\\.html",
  "/gp/forum/email/tracking",
  "amazonappservices\\.com/trk",
  "amazonappservices\\.com/r/",
  "awscloud\\.com/trk",
  // Apple
  "apple\\.com/report/2/its_mail_sf",
  "apple_email_link/spacer",
  // AppRiver
  "appriver\\.com/e1t/o/",
  // Apptivo
  "apptivo\\.com",
  // Asus
  "emditpison\\.asus\\.com",
  // The Atlantic
  "links\\.e\\.theatlantic\\.com/open/log/",
  // AWeber
  "openrate\\.aweber\\.com",
  // Axios
  "link\\.axios\\.com/img/.*\\.gif",
  // Bananatag
  "bl-1\\.com",
  // Blueshift
  "blueshiftmail\\.com/wf/open",
  "getblueshift\\.com/track",
  // Bombcom
  "bixel\\.io",
  // Boomerang
  "mailstat\\.us/tr",
  // Boots
  "boots\\.com/rts/open\\.aspx",
  // Boxbe
  "boxbe\\.com/stfopen",
  // BrowserStack
  "browserstack\\.com/images/mail/track-open",
  // BuzzStream
  "tx\\.buzzstream\\.com",
  // Campaign Monitor
  "cmail(\\d{1,2})\\.com/t/",
  // Canary Mail
  "canarymail\\.io(:\\d+)?/track",
  // Cirrus Insight
  "tracking\\.cirrusinsight\\.com",
  "pardot\\.com/r/",
  // Clio
  "market\\.clio\\.com/trk",
  // Close
  "close\\.(io|com)/email_opened",
  "dripemail2",
  // CloudHQ
  "cloudhq\\.io/mail_track",
  "cloudhq-mkt\\d\\.net/mail_track",
  // Coda
  "coda\\.io/logging/ping",
  // CodePen
  "mailer\\.codepen\\.io/q",
  // Connequity
  "connequitymailer\\.com/open/",
  // Constant Contact
  "rs6\\.net/on\\.jsp",
  "constantcontact\\.com/images/p1x1\\.gif",
  // ContactMonkey
  "contactmonkey\\.com/api/v1/tracker",
  // ConvertKit
  "open\\.convertkit-mail\\d?\\.com",
  "convertkit-mail\\.com/o/",
  // Copper
  "prosperworks\\.com/tp/t",
  // Cprpt
  "/o\\.aspx\\?t=",
  // CreditMantri
  "mailer\\.creditmantri\\.com/t/",
  // Critical Impact
  "portal\\.criticalimpact\\.com/c2/",
  // Customer.io
  "customeriomail\\.com/e/o",
  "track\\.customer\\.io/e/o",
  "/e/o/[a-zA-Z0-9]{10,}",
  // Dell
  "ind\\.dell\\.com",
  // DidTheyReadIt
  "xpostmail\\.com",
  // Dotdigital
  "trackedlink\\.net",
  "dmtrk\\.net",
  // Driftem
  "driftem\\.com/ltrack",
  // Dropbox
  "dropbox\\.com/l/",
  // DZone
  "mailer\\.dzone\\.com/open\\.php",
  // Ebsta
  "console\\.ebsta\\.com",
  "ebsta\\.gif",
  "ebsta\\.com/r/",
  // EdgeSuite
  "epidm\\.edgesuite\\.net",
  // Egocdn
  "egocdn\\.com/syn/mail_s\\.php",
  // EmailTracker
  "my-email-signature\\.link",
  // Emarsys
  "emarsys\\.com/e2t/o/",
  // Etransmail
  "ftrans03\\.com/linktrack/",
  // Eventbrite
  "eventbrite\\.com/emails/action",
  // EventsInYourArea
  "eventsinyourarea\\.com/track",
  // EveryAction
  "click\\.everyaction\\.com/j/",
  // Evite
  "pippio\\.com/api/sync",
  "nli\\.evite\\.com/imp",
  // Facebook
  "facebook\\.com/email_open_log_pic\\.php",
  "facebookdevelopers\\.com/trk",
  "fb\\.com/trk",
  // Flipkart
  "flipkart\\.com/t/open",
  // ForMirror
  "formirror\\.com/open/",
  // Freelancer
  "freelancer\\.com/1px\\.gif",
  // FreshMail
  "mail\\.[a-zA-Z0-9-.]+\\.pl/o/",
  "/o/(\\w){10,}/(\\w){10,}",
  // Front
  "app\\.frontapp\\.com(.*)?/seen",
  "web\\.frontapp\\.com/api",
  // FullContact
  "fullcontact\\.com/wf/open",
  // GearBest
  "appinthestore\\.com/marketing/mail-user-deal/open",
  // Gem
  "zen\\.sr/o",
  // GetBase
  "getbase\\.com/e1t/o/",
  // GetMailSpring
  "getmailspring\\.com/open",
  // GetNotify
  "email81\\.com",
  // GetPocket
  "email\\.getpocket\\.com/wf/open",
  // GetResponse
  "getresponse\\.com/open\\.html",
  // GitHub
  "github\\.com/notifications/beacon",
  // Glassdoor
  "mail\\.glassdoor\\.com/pub/as",
  // GMass
  "ec2-52-26-194-35\\.us-west-2\\.compute\\.amazonaws\\.com",
  "link\\.gmreg\\d\\.net",
  "gmreg\\d\\.net",
  "gmtrack\\.net",
  // Gmelius
  "gml\\.email",
  // Granicus
  "govdelivery\\.com(:\\d+)?/track",
  // GrowthDot
  "growthdot\\.com/api/mail-tracking",
  // Google
  "ad\\.doubleclick\\.net/ddm/ad",
  "google-analytics\\.com/collect",
  "google\\.com/appserve/mkt/img/",
  // Grammarly
  "grammarly\\.com/open",
  // GreenMailInc
  "greenmail\\.co\\.in",
  // Homeaway
  "trk\\.homeaway\\.com",
  // HubSpot
  "t\\.(hubspotemail|hubspotfree|signaux|senal|signale|sidekickopen|sigopn|hsmsdd)",
  "t\\.strk\\d{2}\\.email",
  "track\\.getsidekick\\.com",
  "/e2t/(o|c|to)/",
  // Hunter
  "mltrk\\.io/pixel",
  // iContact
  "click\\.icptrack\\.com/icp/",
  // Keap / InfusionSoft
  "infusionsoft\\.com/app/emailOpened",
  // Insightly
  "insgly\\.net/api/trk",
  // Intercom
  "intercom-mail[a-zA-Z0-9-.]*\\.com/(via/)?(o|q)",
  "via\\.intercom\\.io/o",
  // JangoMail
  "/[a-z]\\.z\\?[a-z]=",
  // Is-tracking-pixel
  "is-tracking-pixel-api-prod\\.appspot\\.com",
  // Klaviyo
  "trk\\.klaviyomail\\.com",
  // LaunchBit
  "launchbit\\.com/taz-pixel",
  // LinkedIn
  "linkedin\\.com/emimp/",
  // Litmus
  "emltrk\\.com",
  // LogDNA
  "ping\\.answerbook\\.com",
  // Magento
  "magento\\.com/trk",
  "magento\\.com/wf/open",
  "go\\.rjmetrics\\.com",
  // Mailcastr
  "mailcastr\\.com/image/[a-zA-Z0-9-_]{10,}",
  // MailChimp
  "list-manage\\.com/track",
  // MailCoral
  "mailcoral\\.com/open",
  // MailInifinity
  "mailinifinity\\.com/ptrack",
  // MailJet
  "mjt\\.lu/oo",
  "links\\.[a-zA-Z0-9-.]+/oo/",
  // MailGun
  "email\\.(mailgun|mg)(.*)?/o/",
  // MailButler
  "mailbutler\\.io/tracking/",
  // MailTag
  "mailtag\\.io/email-event",
  // MailTrack
  "mailtrack\\.io/trace",
  "mltrk\\.io/pixel/",
  // Mailzter
  "mailzter\\.in/ltrack",
  // Mandrill
  "mandrill\\.\\S+/track/open\\.php",
  "mandrillapp\\.com/track",
  // Marketo
  "marketo\\.com/trk",
  // Mention
  "mention\\.com/e/o/",
  // MetaData
  "metadata\\.io/e1t/o/",
  // MixMax
  "(email|track)\\.mixmax\\.com",
  "mixmax\\.com/api/track/",
  "mixmax\\.com/e/o",
  // MixPanel
  "mixpanel\\.com/(trk|track)",
  // MyEmma
  "e2ma\\.net/track",
  "t\\.e2ma\\.net",
  // Nation Builder
  "nationbuilder\\.com/r/o",
  "nationbuilder\\.com/wf/open",
  // NeteCart
  "netecart\\.com/ltrack",
  // NetHunt
  "nethunt\\.com/api/v1/track/email/",
  "nethunt\\.co(.*)?/pixel",
  // Newton
  "tr\\.cloudmagic\\.com",
  // OpenBracket
  "openbracket\\.co/track",
  // Opicle
  "track\\.opicle\\.com",
  // Oracle
  "tags\\.bluekai\\.com/site",
  "en25\\.com/e/",
  "dynect\\.net/trk\\.php",
  "bm5150\\.com/t/",
  "bm23\\.com/t/",
  "[a-zA-Z0-9-.]+/e/FooterImages/FooterImage",
  // Outreach
  "app\\.outreach\\.io",
  "api/mailings/opened",
  "outrch\\.com/api/mailings/opened",
  "getoutreach\\.com/api/mailings/opened",
  // Payback
  "email\\.payback\\.in/a/",
  "mail\\.payback\\.in/tr/",
  // PayPal
  "paypal-communication\\.com/O/",
  // Paytm
  "email\\.paytm\\.com/wf/open",
  "trk\\.paytmemail\\.com",
  // phpList
  "/ut\\.php\\?u=",
  "phplist\\.com/lists/ut\\.php",
  // Pipedrive
  "pipedrive\\.com/wf/open",
  "api\\.nylas\\.com/open",
  // Playdom
  "playdom\\.com/g",
  // Polymail
  "polymail\\.io/v2/z",
  "share\\.polymail\\.io",
  // Postmark
  "pstmrk\\.it",
  // Product Hunt
  "links\\.producthunt\\.com/oo/",
  // ProlificMail
  "prolificmail\\.com/ltrack",
  // Quora
  "quora\\.com/qemail/mark_read",
  // ReplyCal
  "replycal\\.com/home/index/\\?token",
  // ReplyMsg
  "replymsg\\.com",
  // Responder
  "opens\\.responder\\.co\\.il",
  // Return Path
  "returnpath\\.net/pixel\\.gif",
  // Rocketbolt
  "email\\.rocketbolt\\.com/o/",
  // Runtastic
  "runtastic\\.com/mo/",
  // Sailthru
  "sailthru\\.com/trk",
  // Salesforce
  "salesforceiq\\.com/t\\.png",
  "beacon\\.krxd\\.net",
  "app\\.relateiq\\.com/t\\.png",
  "nova\\.collect\\.igodigital\\.com",
  "exct\\.net/open\\.aspx",
  "click\\.[a-zA-Z0-9-.]+/open\\.aspx",
  // SalesHandy
  "saleshandy\\.com/web/email/countopened",
  // SalesLoft
  "salesloft\\.com/email_trackers",
  // Segment
  "email\\.segment\\.com/e/o/",
  // Selligent
  "strongview\\.com/t",
  // SendInBlue
  "sendibtd\\.com",
  "sendibw{2}\\.com/track/",
  // SendGrid
  "sendgrid\\.(net|com)/wf/open",
  "sendgrid\\.(net|com)/trk",
  "sendgrid\\.(net|com)/mpss/o",
  "sendgrid\\.(net|com)/ss/o",
  "wf/open\\?upn",
  // SendPulse
  "stat-pulse\\.com",
  // Sendy
  "/sendy/t/",
  // Signal
  "signl\\.live/tracker",
  // Skillsoft
  "skillsoft\\.com/trk",
  // Streak
  "mailfoogae\\.appspot\\.com",
  "streak\\.com/e/o/",
  // Substack
  "substack\\.com/o/",
  // Superhuman
  "r\\.superhuman\\.com",
  // TataDocomoBusiness
  "tatadocomobusiness\\.com/rts/",
  // Techgig
  "tj_mailer_opened_count_all\\.php",
  // The Top Inbox
  "thetopinbox\\.com/track/",
  // TinyLetter
  "tinyletterapp\\.com\\.*\\?open",
  // Thunderhead
  "na5\\.thunderhead\\.com",
  // ToutApp
  "go\\.toutapp\\.com",
  // TrackApp
  "trackapp\\.io/b/",
  "trackapp\\.io/r/",
  "trackapp\\.io/static/img/track\\.gif",
  // Transferwise
  "links\\.transferwise\\.com/track/",
  // Trello
  "sptrack\\.trello\\.com/q/",
  "i\\.trellomail\\.com/e/eo",
  // Udacity
  "udacity\\.com/wf/open",
  // Unsplash
  "email\\.unsplash\\.com/o/",
  // Upwork
  "email\\.mg\\.upwork\\.com/o/",
  // Vcommission
  "tracking\\.vcommission\\.com",
  // Vtiger
  "od2\\.vtiger\\.com/shorturl\\.php",
  // WildApricot
  "wildapricot\\.com/o/",
  "wildapricot\\.org/emailtracker",
  // Wix
  "shoutout\\.wix\\.com/[a-zA-Z0-9-.]*/pixel",
  // Workona
  "workona\\.com/mk/op/",
  // YAMM
  "yamm-track\\.appspot",
  // Yesware
  "yesware\\.com/trk",
  "yesware\\.com/t/",
  "t\\.yesware\\.com",
  // Zendesk
  "futuresimple\\.com/api/v1/sprite\\.png",
  // Generic / Unknown
  "/track/open",
  "/open\\.aspx\\?tp=",
  "/WebEvent/SetCookie\\.gif\\?tp=",
  "email\\.[a-zA-Z0-9-.]+/o/[a-zA-Z0-9-._]{10,}",
  "/smtp\\.mailopen",
  // Misc extras (from JSON ruleset)
  "open\\.delivery\\.net/o",
  "almond\\.alphasights\\.com/signature-pixel",
  "loxo\\.co/px",
  "analytics\\.thebodyshop\\.com/ea/",
  "analytics\\.[a-zA-Z0-9-.]+/ea/",
  "groove\\.grvlnk4\\.com/p/",
  "stripe\\.com/trk",
  "track\\.athyna\\.io",
  "cyrus\\.cybercoders\\.com/prezent-api",
  "analytics\\.ubs\\.com",
  "mailtracker\\.com/pixel",
  "qualtrics\\.com/.*/Watermark\\.php",
  "track\\.agileupside\\.com",
  "click\\.ngpvan\\.com",
  "hs-sales-engage\\.com",
  "hubspotlinks\\.com/Cto",
  "servlet/servlet\\.ImageServer\\?oid",
];

export const EMAIL_TRACKERS_REGEXP = new RegExp(EMAIL_TRACKERS.join("|"));

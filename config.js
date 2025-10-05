const fs = require('fs')
const chalk = require('chalk')

//================== PERSONAL LINKS & DETAILS ===================\\
global.ig = 'https://wa.me/254787100498'
global.ytname = 'YT: https://www.youtube.com/@TitusMutuku'
global.owner = ['254787100498']
global.ownernomer = '254787100498'
global.socialm = 'GitHub: https://github.com/Titus-bot-hue/Titus-bot'
global.location = 'Kenya'

//================== SETTING BOT ===============================\\
global.botname = "TITUS-BOT Quantum Edition"
global.ownernumber = '254787100498'
global.botnumber = '254787100498'
global.ownername = 'Titus Mutuku'
global.ownerNumber = ["254787100498@s.whatsapp.net"]
global.themeemoji = '🚀'
global.wm = "TITUS-BOT Quantum Edition"
global.creator = "254787100498@s.whatsapp.net"
global.packname = "TITUS-BOT"
global.author = "Titus Mutuku"

//================== BEHAVIOR SETTINGS ==========================\\
global.prefa = ['', '!', '.', '#', '&']

// Feature toggles
global.anticall = true
global.chatbot = true
global.autoremove = false
global.autowelcome = true
global.autoRecording = false
global.autoTyping = false
global.autorecordtype = false
global.autoread = false
global.autobio = true
global.anti92 = false
global.autoswview = false

// Menu Type
global.typemenu = 'v1'

//================== REPLY MESSAGES =============================\\
global.mess = {
    done: '✅ DONE!',
    prem: '🔒 This feature is for premium users only.',
    admin: '⚠️ Admins only.',
    botAdmin: '⚙️ Bot must be admin to use this.',
    owner: '👑 Owner only.',
    group: '👥 Group only feature.',
    private: '💬 Private chat only.',
    wait: '⏳ Processing...',
    error: '❌ Error!',
}

//================== THUMBNAIL =============================\\
global.thumb = fs.readFileSync('')

//================== AUTO UPDATE ============================\\
let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update '${__filename}'`))
    delete require.cache[file]
    require(file)
})

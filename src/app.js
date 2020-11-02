require('dotenv').config();
const {PDFDocument, StandardFonts} = require('pdf-lib')
const QRCode = require('qrcode')
const moment = require('moment');
const fs = require('fs')
var users = require('./users.json');
const request = require('request');
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TOKEN, {
    polling: true
});

const generateQR = async text => {
    try {
        var opts = {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
        }
        return await QRCode.toDataURL(text, opts)
    } catch (err) {
        console.error(err)
    }
}


function idealFontSize(font, text, maxWidth, minSize, defaultSize) {
    let currentSize = defaultSize
    let textWidth = font.widthOfTextAtSize(text, defaultSize)

    while (textWidth > maxWidth && currentSize > minSize) {
        textWidth = font.widthOfTextAtSize(text, --currentSize)
    }

    return (textWidth > maxWidth) ? null : currentSize
}


async function generatePdf(profile, reasons, delay) {

    const {
        lastname,
        firstname,
        birthday,
        lieunaissance,
        address,
        zipcode,
        town,
        leavingtime
    } = profile

    const datesortie = moment(leavingtime.toDate()).format("DD/MM/YYYY")
    const heuresortie = moment(leavingtime.toDate()).format("HH:MM").replace(':', 'h')


    const creationTime = leavingtime.subtract(delay, 'minutes').toDate();
    const creationDate = creationTime.toLocaleDateString('fr-FR')
    const creationHour = creationTime.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
    }).replace(':', 'h')

    const data = [
        `Cree le: ${creationDate} a ${creationHour}`,
        `Nom: ${lastname}`,
        `Prenom: ${firstname}`,
        `Naissance: ${birthday} a ${lieunaissance}`,
        `Adresse: ${address} ${zipcode} ${town}`,
        `Sortie: ${datesortie} a ${heuresortie}`,
        `Motifs: ${reasons}`,
    ].join('; ')

    const existingPdfBytes = fs.readFileSync("certificate.pdf")
    const pdfDoc = await PDFDocument.load(existingPdfBytes)
    const page1 = pdfDoc.getPages()[0]

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const drawText = (text, x, y, size = 11) => {
        page1.drawText(text, {
            x,
            y,
            size,
            font
        })
    }

    drawText(`${firstname} ${lastname}`, 119, 696)
    drawText(birthday, 119, 675)
    drawText(lieunaissance, 297, 674)
    drawText(`${address} ${zipcode} ${town}`, 133, 652)

    if (reasons.includes('travail')) {
        drawText('x', 78, 578, 19)
    }
    if (reasons.includes('courses')) {
        drawText('x', 78, 533, 19)
    }
    if (reasons.includes('sante')) {
        drawText('x', 78, 477, 19)
    }
    if (reasons.includes('famille')) {
        drawText('x', 78, 435, 19)
    }
    if (reasons.includes('handicap')) {
        drawText('x', 78, 396, 19)
    }
    if (reasons.includes('sport')) {
        drawText('x', 78, 358, 19)
    }
    if (reasons.includes('judiciaire')) {
        drawText('x', 78, 295, 19)
    }
    if (reasons.includes('missions')) {
        drawText('x', 78, 255, 19)
    }
    if (reasons.includes('ecole')) {
        drawText('x', 78, 211, 19)
    }

    let locationSize = idealFontSize(font, profile.town, 83, 7, 11)

    drawText(profile.town, 105, 177, locationSize)

    if (reasons !== '') {
        drawText(`${datesortie}`, 91, 153)
        drawText(`${heuresortie}`, 264, 153)
    }

    //drawText('Date de création:', 464, 150, 7)
    //drawText(`${creationDate} à ${creationHour}`, 105, 177, 7)

    const generatedQR = await generateQR(data)

    const qrImage = await pdfDoc.embedPng(generatedQR)

    page1.drawImage(qrImage, {
        x: page1.getWidth() - 156,
        y: 100,
        width: 92,
        height: 92,
    })

    pdfDoc.addPage()
    const page2 = pdfDoc.getPages()[1]
    page2.drawImage(qrImage, {
        x: 50,
        y: page2.getHeight() - 350,
        width: 300,
        height: 300,
    })

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync("attestation.pdf", pdfBytes, 'binary');
}


async function sendFile(profile, reasons, delay, recipient) {
    await generatePdf(profile, reasons, delay)
    const url = 'https://api.telegram.org/bot' + process.env.TOKEN + '/sendDocument'
    const r = request.post(url)
    const form = r.form();
    form.append('chat_id', recipient);
    form.append('document', fs.createReadStream("attestation.pdf"), {
        filename: 'attestation.pdf'
    });
}

bot.onText(/\/attestation/, (msg, match) => {
    const chatId = msg.chat.id;
    config = users[chatId]
    if (config == undefined){
      bot.sendMessage(
          chatId,
          'Utilisateur inconnu',
          {parse_mode: 'MarkdownV2'}
        );
      return;
    }
    const args = match.input.split(' ');
    delay = args[1]
    bot.on('polling_error', error => console.log(error))
    current_date = new Date()
    date = moment(current_date).format('DD/MM/YYYY');
    time = moment(current_date).format('HH:MM');
    console.log(date);
    console.log(time);


    if (time === undefined) {
        bot.sendMessage(
            chatId,
            'Please provide a time formated as *HH:MM*',
            {parse_mode: 'MarkdownV2'}
        );
        return;
    }

    if (delay === undefined) {
        delay = 0
    }

    const profile = {
        address: config.ADDRESS,
        birthday: config.BIRTHDAY,
        leavingtime: moment(date + " " + time, 'DD/MM/YYYY HH:mm'),
        firstname: config.FIRSTNAME,
        lastname: config.LASTNAME,
        lieunaissance: config.BIRTHPLACE,
        town: config.TOWN,
        zipcode:config.ZIPCODE
    }


    bot.sendMessage(
        chatId,
        'Choisir le motif de déplacement', {
            reply_markup: {
                inline_keyboard: [
                    [{
                        text: 'Travail',
                        callback_data: 'travail'
                    }, {
                        text: 'Courses',
                        callback_data: 'courses'
                    }, {
                        text: 'Santé',
                        callback_data: 'sante'
                    }, {
                        text: 'Famille',
                        callback_data: 'famille'
                    }],
                    [{
                        text: 'Handicap',
                        callback_data: 'handicap'
                    }, {
                        text: 'Sport',
                        callback_data: 'sport'
                    }, {
                        text: 'Administratif',
                        callback_data: 'admin'
                    }, {
                        text: 'Missions',
                        callback_data: 'mission'
                    }],
                    [{
                        text: 'Ecole',
                        callback_data: 'ecole'
                    }, {
                        text: 'OK',
                        callback_data: 'ok'
                    }]
                ],
                force_reply: true
            }
        }
    );


    const reasons = new Array;
    bot.on('callback_query', async (callbackQuery) => {
        const message = callbackQuery.message;
        const category = callbackQuery.data;
        if (category != 'ok') {
            if (reasons.includes(category)) {
                for (var i = 0; i < reasons.length; i++) {
                    if (reasons[i] === category) {
                        reasons.splice(i, 1);
                    }
                }
            } else {
                reasons.push(category)
            }
            bot.sendMessage(chatId, `_Selected reasons:_ ${reasons.join(', ')}`, {parse_mode: 'MarkdownV2'});
        } else {
            await sendFile(profile, reasons, delay,chatId)
            reasons.length = 0
            bot.stopPolling()
        }

    });


});

require('dotenv').config();
const {PDFDocument, StandardFonts} = require('pdf-lib')
const QRCode = require('qrcode')
const moment = require('moment');
const fs = require('fs')
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

    const datesortie = leavingtime.toDate().toLocaleDateString('fr-FR')
    const heuresortie = leavingtime.toDate().toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
    }).replace(':', 'h')


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

    const existingPdfBytes = fs.readFileSync("src/certificate.pdf")
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

    drawText(`${firstname} ${lastname}`, 123, 686)
    drawText(birthday, 123, 661)
    drawText(lieunaissance, 92, 638)
    drawText(`${address} ${zipcode} ${town}`, 134, 613)

    if (reasons.includes('travail')) {
        drawText('x', 76, 527, 19)
    }
    if (reasons.includes('courses')) {
        drawText('x', 76, 478, 19)
    }
    if (reasons.includes('sante')) {
        drawText('x', 76, 436, 19)
    }
    if (reasons.includes('famille')) {
        drawText('x', 76, 400, 19)
    }
    if (reasons.includes('sport')) {
        drawText('x', 76, 345, 19)
    }
    if (reasons.includes('judiciaire')) {
        drawText('x', 76, 298, 19)
    }
    if (reasons.includes('missions')) {
        drawText('x', 76, 260, 19)
    }
    let locationSize = idealFontSize(font, profile.town, 83, 7, 11)

    drawText(profile.town, 111, 226, locationSize)

    if (reasons !== '') {
        drawText(`${datesortie}`, 92, 200)
        drawText(`${heuresortie}`, 200, 201)
    }

    drawText('Date de création:', 464, 150, 7)
    drawText(`${creationDate} à ${creationHour}`, 455, 144, 7)

    const generatedQR = await generateQR(data)

    const qrImage = await pdfDoc.embedPng(generatedQR)

    page1.drawImage(qrImage, {
        x: page1.getWidth() - 170,
        y: 155,
        width: 100,
        height: 100,
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


async function sendFile(profile, reasons, delay) {
    await generatePdf(profile, reasons, delay)
    const url = 'https://api.telegram.org/bot' + process.env.TOKEN + '/sendDocument'
    const r = request.post(url)
    const form = r.form();
    form.append('chat_id', process.env.CHATID);
    form.append('document', fs.createReadStream("attestation.pdf"), {
        filename: 'attestation.pdf'
    });
}

bot.onText(/\/generate/, (msg, match) => {
    const chatId = msg.chat.id;
    const args = match.input.split(' ');

    date = args[1]
    time = args[2]
    delay = args[3]
    bot.on('polling_error', error => console.log(error))
    if (date === undefined) {
        bot.sendMessage(
            chatId,
            'Please provide a date formated as *DD/MM/YYYY*',
            {parse_mode: 'MarkdownV2'}
        );
        return;
    }

    if (time === undefined) {
        bot.sendMessage(
            chatId,
            'Please provide a time formated as *HH:MM*',
            {parse_mode: 'MarkdownV2'}
        );
        return;
    }

    if (delay === undefined) {
        bot.sendMessage(
            chatId,
            'Please provide a delay; _number of minutes_.',
            {parse_mode: 'MarkdownV2'}
        );
        return;
    }

    const profile = {
        address: process.env.ADDRESS,
        birthday: process.env.BIRTHDAY,
        leavingtime: moment(date + " " + time, 'DD/MM/YYYY HH:mm'),
        firstname: process.env.FIRSTNAME,
        lastname: process.env.LASTNAME,
        lieunaissance: process.env.BIRTHPLACE,
        town: process.env.TOWN,
        zipcode: process.env.ZIPCODE
    }


    bot.sendMessage(
        chatId,
        'Tap to choose reason(s), tap once again to remove, tap DONE when finished.', {
            reply_markup: {
                inline_keyboard: [
                    [{
                        text: 'Travail',
                        callback_data: 'development'
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
                        text: 'Sport',
                        callback_data: 'sport'
                    }, {
                        text: 'Judiciaire',
                        callback_data: 'judiciaire'
                    }, {
                        text: 'Missions',
                        callback_data: 'missions'
                    }, {
                        text: 'DONE',
                        callback_data: 'done'
                    }]
                ],
                force_reply: true
            }
        }
    );


    const reasons = new Array;
    bot.on('callback_query', (callbackQuery) => {
        const message = callbackQuery.message;
        const category = callbackQuery.data;
        if (category != 'done') {
            if (reasons.includes(category)) {
                for (var i = 0; i < reasons.length; i++) {
                    if (reasons[i] === category) {
                        reasons.splice(i, 1);
                    }
                }
            } else {
                reasons.push(category)
            }
            bot.sendMessage(chatId, `Selected reasons: *_${reasons.join(', ')}_*`, {parse_mode: 'MarkdownV2'});
        } else {
            sendFile(profile, reasons, delay)
        }

    });


});
const config = require('./config')

const { Airgram, Auth, prompt, toObject } = require( 'airgram' )
const airgram = new Airgram({
  apiId: config.apiId,
  apiHash: config.apiHash,
  useChatInfoDatabase: true,
  useMessageDatabase: true,
  databaseDirectory: './db/',
  logVerbosityLevel: 0,
})
airgram.use(new Auth({
    code: () => prompt(`Please enter the secret code:\n`),
    phoneNumber: () => prompt(`Please enter your phone number:\n`),
    password: () => prompt(`Please enter your pw:\n`)
}))
const sharp = require('sharp')

const { exec } = require('child_process')
const { getVideoDurationInSeconds } = require('get-video-duration')
const getVideoDimensions = require('get-video-dimensions')
const moment = require('moment')
const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const EventEmitter = require('events');
class TGFileUploadEmitter extends EventEmitter {}
const tgFileUploadEmitter = new TGFileUploadEmitter()

const axios = require('axios').default
const mgAPI = axios.create({
    baseURL: `https://${ config.username }:${ config.password }@massengeschmack.tv/api/v1/`,
    timeout: 3000,
})
const filesize = require('file-size')
const listSubscriptions = () => mgAPI.get('/?action=listSubscriptions')
const getFeed = (id, page) => mgAPI.get(`/?action=getFeed&from=[${ id }]&page=${ page }&limit=100`)
const getClip = (id) => mgAPI.get(`/?action=getClip&identifier=${ id }`)

const sleep = (ms) => new Promise((res) => setTimeout(res, ms))
const getTodayHash = () => moment().format("YYYY_MM_DD")

const ripEpisode = async (def) => {
    const epFile = `cache/${ def.pid }/${ def.identifier }`
    const epSuccFile = epFile + '.succ'
    const epCloudIDFile = epFile + '.cloudid'
    const epDataFile = epFile + '.json'
    const epVideoFile = epFile + '.mp4'
    const epThumbFile = epFile + '.jpg'
    const epThumbFileOrig = epFile + '.t.jpg'
    console.log(def.identifier)
    try {
        if (fs.existsSync(epDataFile) == false) fs.writeFileSync(epDataFile, JSON.stringify((await getClip(def.identifier)).data, null, '\t'))
    } catch (e) {
        if (e.response.status === 429) {
            console.log('sleeping 30s')
            await sleep(30e3)
            return await ripEpisode(def)
        }
    }
    if (fs.existsSync(epSuccFile) == false) {
        const clipJSON = JSON.parse(fs.readFileSync(epDataFile)) // (await getClip(def.identifier)).data
        fs.writeFileSync(epDataFile, JSON.stringify(clipJSON, null, '\t'))
        let clipFiles = clipJSON.files
        
        clipFiles = clipFiles.filter(clip => clip.size <= 1500e6 && clip.t !== 'music' && clip.url.indexOf('.mp4') > 2) // find good file to succ
        clipFiles.sort((a, b) => b.size - a.size)
        if (clipFiles.length === 0) {
            console.log('skipping, no good formats available')
            return -1
        }
        let selectedFile = clipFiles[0]
        await new Promise(async (res, rej) => {
            if (clipJSON.img.indexOf('http') === -1)
                clipJSON.img = 'https://massengeschmack.tv' + clipJSON.img
            const cmd = `curl -L -o "${ epThumbFileOrig }" "${ clipJSON.img }"`
            let child = exec(cmd)
            child.on('exit', res)
        })
        await sleep(250)
        await sharp(epThumbFileOrig)
            .resize(200)
            .toFile(epThumbFile)
        await sleep(250)
        
        if (fs.existsSync(epCloudIDFile) == false) {
            console.time('download')
            await new Promise(async (res, rej) => {
                selectedFile.url = 'https:' + selectedFile.url
                const cmd = `curl -L --user "${ config.username }:${ config.password }" -o "${ epVideoFile }" -C - "${ selectedFile.url }"`
                let child = exec(cmd)
                //child.stdout.pipe(process.stdout)
                //child.stderr.pipe(process.stdout)
                child.on('exit', res)
            })
            console.log(filesize(selectedFile.size).human())
            console.timeEnd('download')
        }
        let tgCloud
        if (fs.existsSync(epCloudIDFile) == false) { // upload to tg
            await sleep(2e3)
            const dimsT = await getVideoDimensions(epThumbFile)
            const dims = await getVideoDimensions(epVideoFile)
            const durr = await getVideoDurationInSeconds(epVideoFile)
            console.time('upload')
            //console.log(epVideoFile, dims, durr, epThumbFile, dimsT)
            let postRequeset = await airgram.api.sendMessage({
                chatId: botChatId,
                inputMessageContent: {
                    _: 'inputMessageVideo',
                    video: { _: 'inputFileLocal', path: epVideoFile },
                    thumbnail: {
                        _: 'inputThumbnail',
                        thumbnail: { _: 'inputFileLocal', path: epThumbFile },
                        width: dimsT.width, height: dimsT.height,
                    },
                    supportsStreaming: true,
                    width: dims.width,
                    height: dims.height,
                    duration: parseInt(durr),
                    caption: {
                        _: 'formattedText',
                        text: `#${ makeHashtag(clipJSON.pdesc) } ${ clipJSON.title }\n${ clipJSON.duration }\t${ selectedFile.desc }\t${ dims.width }x${ dims.height }\n\n${ clipJSON.desc }`
                    }
                },
            })
            /*await new Promise(async (res, rej) => {
                const cmd = `cp "${ epThumbFile }" "bot.jpg"`
                let child = exec(cmd)
                child.on('exit', res)
            })*/
            //console.log(postRequeset)
            try {
                //console.log(clipJSON)
                tgCloud = await new Promise((res, rej) => {
                    tgFileUploadEmitter.removeAllListeners()
                    tgFileUploadEmitter.once('finished', res)
                    tgFileUploadEmitter.once('failed', rej) // + postRequeset.response.id, res)
                })    
            } catch (e) {
                console.error(e)
                return await ripEpisode(def)
            }
            console.timeEnd('upload')
            fs.writeFileSync(epCloudIDFile, JSON.stringify(tgCloud, null, '\t'))
        } else {
            tgCloud = JSON.parse(fs.readFileSync(epCloudIDFile))
        }
        try {
            fs.unlinkSync(epVideoFile)
            fs.unlinkSync(epThumbFile)
            fs.unlinkSync(epThumbFileOrig)
        } catch (e) { }
        fs.writeFileSync(epSuccFile, '1')
        //console.log(tgCloud)
    } else { console.log(def.identifier + ' already ripped succ'); return -1 }
}

airgram.on('updateMessageSendAcknowledged', ({ update }) => {
    //console.log(update)
})
airgram.on('updateMessageSendFailed', ({ update }) => {
    //console.log(update)
    tgFileUploadEmitter.emit('failed', update)
})
airgram.on('updateMessageSendSucceeded', ({ update }) => {
    //console.log(update)
    tgFileUploadEmitter.emit('finished', update)
})
airgram.on('uploadFile', ({ update }) => {
    const file = update.file
    //console.log(file)
    if (file.remote.isUploadingActive) {
        const prog = file.remote.uploadedSize / file.size
        prog = prog.toFixd(2)
        if (prog.indexOf('.00') > -1) console.log(prog)
    }
})
const makeHashtag = (str) => {
    str = str.replace(/[^\x00-\x7F]/g, "")
    str = str.replace(/\(/g, "")
    str = str.replace(/\)/g, "")
    str = str.replace(/&/g, "")
    str = str.replace(/!/g, "")
    str = str.replace(/\s/g, "_")
    str = str.trim()
    return str
}
const ripSeries = async (def) => {
    let episodes = []
    let lastRes
    const cacheFile = `cache/${ def.pid }/${ getTodayHash() }.json`
    if (fs.existsSync(cacheFile) == false) {
        mkdirp.sync(`cache/${ def.pid }`)
        console.log('there is no cache file for ', cacheFile, ' .... downloading')
        do {
            const page = lastRes ? lastRes.next : 1
            lastRes = (await getFeed(def.pid, page)).data
            episodes = episodes.concat(lastRes.eps)
            console.log('downloaded page', page)
            await sleep(3e3)
        } while (lastRes.next > 0)
        fs.writeFileSync(cacheFile, JSON.stringify(episodes, null, '\t'))
    } else {
        episodes = JSON.parse(fs.readFileSync(cacheFile))
    }
    episodes.sort((a,b) => a.date - b.date)
    for (let episode of episodes) {
        try {
            if( await ripEpisode(episode) === -1) continue;
        } catch (e) { console.error(e) }
        await sleep(3e3)
        //break
    }
}
const main = async () => {
    console.log(
        await airgram.api.getChat({ chatId: config.botChatId })
    )
    //let subs = (await listSubscriptions()).data
    const subs = {
        active_subscriptions: [
            { title: 'Fernsehkritik-TV', pid: 1 },
            { title: 'Pantoffelkino', pid: 2 },
            { title: 'Pressesch(l)au', pid: 3 },
            { title: 'Pasch-TV', pid: 4 },
            { title: 'Netzprediger', pid: 5 },
            { title: 'Asynchron', pid: 6 },
            { title: 'TonAngeber', pid: 7 },
            { title: 'Hoaxilla-TV', pid: 8 },
            { title: 'Sakura', pid: 9 },
            { title: 'Migropolis', pid: 10 },
            { title: 'Serienkiller', pid: 11 },
            { title: 'Das Vorzelt zur Hölle', pid: 12 },
            { title: 'Jung & Anders', pid: 13 },
            { title: 'Interaktiv', pid: 14 },
            { title: 'Sprechplanet', pid: 15 },
            { title: 'Die Geisterjäger', pid: 16 },
            { title: 'Der ComicTalk', pid: 17 },
            { title: 'Moritz und die Anderen', pid: 18 },
            { title: 'Veto', pid: 19 },
            { title: 'Achtung Spoiler!', pid: 20 },
            { title: 'Offensio', pid: 21 },
            // 22 *hmmmmmmmmmmm*
            { title: 'Die Mediatheke', pid: 23 },
            { title: 'Trip', pid: 24 },
            { title: 'Sonntagsfrühstück', pid: 25 },
            { title: 'Das Studio', pid: 26 },
            { title: 'Paddys Retrokosmos', pid: 27 },
            { title: 'Massengeschnack', pid: 29 }
        ]
    }
    //console.log(subs.active_subscriptions.map(x => makeHashtag(x.title)))

    await ripSeries(subs.active_subscriptions[0]) // FKTV
    await ripSeries(subs.active_subscriptions[2]) // Presseschlau
    await ripSeries(subs.active_subscriptions[4]) // Netzprediger
    await ripSeries(subs.active_subscriptions[21]) // Die Mediatheke
    await ripSeries(subs.active_subscriptions[22]) // Trip

    await ripSeries(subs.active_subscriptions[5]) // Asynchron
    await ripSeries(subs.active_subscriptions[7]) // Hoaxilla-Tv

}
main()

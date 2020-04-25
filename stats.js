const config = require('./config')
const filesize = require('file-size')
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(config.token, { polling: false })
const moment = require('moment')
const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')

const axios = require('axios').default
const mgAPI = axios.create({
    baseURL: `https://${ config.username }:${ config.password }@massengeschmack.tv/api/v1/`,
    timeout: 3000,
})
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
    /*try {
        if (fs.existsSync(epDataFile) == false) fs.writeFileSync(epDataFile, JSON.stringify((await getClip(def.identifier)).data, null, '\t'))
    } catch (e) {
        if (e.response.status === 429) {
            
        }
    }*/
    if (fs.existsSync(epSuccFile) == false) return true
    const clipJSON = JSON.parse(fs.readFileSync(epDataFile)) // (await getClip(def.identifier)).data
    fs.writeFileSync(epDataFile, JSON.stringify(clipJSON, null, '\t'))
    let clipFiles = clipJSON.files

    clipFiles = clipFiles.filter(clip => clip.size <= 1500e6 && clip.t !== 'music' && clip.url.indexOf('.mp4') > 2) // find good file to succ
    clipFiles.sort((a, b) => b.size - a.size)
    if (clipFiles.length === 0) {
        console.log('skipping, no good formats available')
        return false
    }
    let selectedFile = clipFiles[0]
    return [ selectedFile.size, clipJSON.duration ]
}
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
    let size = 0, duration = moment.duration(0), episodeCounter = 0
    for (let episode of episodes) {
        try {
            episodeCounter++
            let res = await ripEpisode(episode)
            if (res === true) break;
            if (typeof(res) === 'object') {
                size += res[0]
                duration.add(moment.duration(res[1]))
            }

        } catch (e) { console.error(e) }
        //await sleep(3e3)
        //break
    }
    return `#${ makeHashtag(def.title) } ${ episodes.length }/${ filesize(size).human() }/${ duration.asHours().toFixed(0) }h`
}
const main = async () => {
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
    let lines = [
        await ripSeries(subs.active_subscriptions[0]), // FKTV
        await ripSeries(subs.active_subscriptions[2]), // Presseschlau
        await ripSeries(subs.active_subscriptions[4]), // Netzprediger
        await ripSeries(subs.active_subscriptions[21]), // Die Mediatheke
        await ripSeries(subs.active_subscriptions[22]), // Trip

        await ripSeries(subs.active_subscriptions[5]), // Asynchron

        await ripSeries(subs.active_subscriptions[7]), // Hoaxilla-Tv
    ].join('\n')
    console.log(lines)
    bot.setChatDescription(config.botTargetChan, lines)

}
main()

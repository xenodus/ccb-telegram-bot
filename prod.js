/******************************
  Variables & Libs
*******************************/

const moment = require("moment");
const Telegraf = require('telegraf');
const axios = require('axios');
const TelegrafInlineMenu = require('telegraf-inline-menu');

/******************************
  Bot Auth
*******************************/

const scriptName = __filename.slice(__dirname.length + 1);

const config = ( scriptName == 'staging.js' ) ? require('./config').staging : require('./config').production;
const telegramPool = config.getTelegramPool();
const discordPool = config.getDiscordPool();
const ccbPool = config.getCCBPool();
const bot = new Telegraf(config.token);

if( scriptName == 'staging.js' ) {
  console.log("----- DEVELOPMENT BOT ("+config.username+") -----");
}
else {
  console.log("----- PRODUCTION BOT ("+config.username+") -----");
}

/******************************
  Bot Events
*******************************/

bot.start(async function(ctx){
  await updateChatID(ctx.update.message);
  ctx.reply("Hello CCB");
})

bot.command('events', async function(ctx){
  await updateChatID(ctx.update.message);
  await fetchDisplayEvents(ctx);
})

bot.command('funfact', async function(ctx){
  await fetchDisplayFunFacts(ctx);
})

bot.command('xur', async function(ctx){
  await fetchDisplayXur(ctx);
})

bot.command('ff', async function(ctx){
  await fetchDisplayFunFacts(ctx);
})

bot.hears('events', async function(ctx){
  await updateChatID(ctx.update.message);
  await fetchDisplayEvents(ctx);
})

bot.command('online', async function(ctx){
  await fetchDisplayMembersOnlineIngame(ctx);
})

/******************************
  Menus
*******************************/

const mainMenu = new TelegrafInlineMenu('Main Menu');
const helpMenu = new TelegrafInlineMenu('Help');
const notifyMenu = new TelegrafInlineMenu('Notifications');
mainMenu.submenu('Help', 'help', helpMenu);
mainMenu.submenu('Event Notification', 'notify', notifyMenu);

/******************************
  /help
*******************************/

helpMenu.setCommand('help');

helpMenu.simpleButton('Show LFG events', 'a', {
  doFunc: function(ctx){
    ctx.getChat().then(async function(chat){
      ctx.chat = chat;
      await updateChatID(ctx);
      await fetchDisplayEvents(ctx);
    });
  }
});

helpMenu.simpleButton(async function(ctx){
  chat_id = await ctx.getChat().then(function(chat){
    return chat.id;
  });

  let text = 'Turn on notifications';

  await telegramPool.then(async function(pool){
    await pool.query("SELECT * FROM channels WHERE chat_id = ?", [chat_id]).then(function(res){
      if( res.length > 0 && res[0].notify == 1 ) {
        text = 'Turn off notifications';
      }
    });
  });

  return text;
}, 'b', {
  doFunc: function(ctx){
    toggleNotification(ctx, true);
  },
  joinLastRow: true,
});

helpMenu.simpleButton('Where is Xûr', 'c', {
  doFunc: function(ctx){
    ctx.getChat().then(async function(chat){
      await fetchDisplayXur(ctx);
    });
  }
});

helpMenu.simpleButton('Fun Fact', 'd', {
  doFunc: function(ctx){
    ctx.getChat().then(async function(chat){
      await fetchDisplayFunFacts(ctx);
    });
  },
  joinLastRow: true,
});

helpMenu.simpleButton('Members Online', 'e', {
  doFunc: function(ctx){
    ctx.getChat().then(async function(chat){
      await fetchDisplayMembersOnlineIngame(ctx);
    });
  }
});

/******************************
  /notify
*******************************/

notifyMenu.setCommand('notify');

notifyMenu.simpleButton(async function(ctx){
  chat_id = await ctx.getChat().then(function(chat){
    return chat.id;
  });

  let text = 'Turn on notifications';

  await telegramPool.then(async function(pool){
    await pool.query("SELECT * FROM channels WHERE chat_id = ?", [chat_id]).then(function(res){
      if( res.length > 0 && res[0].notify == 1 ) {
        text = 'Turn off notifications';
      }
    });
  });

  return text;
}, 'a', {
  doFunc: function(ctx){
    toggleNotification(ctx);
  }
});

bot.use(mainMenu.init());
bot.startPolling();
bot.launch();

/******************************
  Functions
*******************************/

function getMenuArr(notify_status="on"){
  return [
    [
      { text: 'Show LFG events', callback_data: 'help:a' },
      { text: 'Turn '+notify_status+' notifications', callback_data: 'help:b' }
    ],
    [
      { text: 'Where is Xûr', callback_data: 'help:c' },
      { text: 'Fun Fact', callback_data: 'help:d' }
    ],
    [
      { text: 'Members Online', callback_data: 'help:e' }
    ]
  ];
}

function fetchDisplayMembersOnlineIngame(ctx) {
  axios.get('https://ccb-destiny.com/api/activity').then(async function(response){
    if( response.status === 200 ) {
      let no_online = response.data.length;
      let msg = "Members Online: " + no_online;

      if( no_online > 0 ) {
        msg += "\n" + response.data.map(m => m.displayName).join(", ");
      }

      await ctx.reply(msg, {'parse_mode': 'HTML', 'disable_web_page_preview': true});
    }
  });
}

function fetchDisplayXur(ctx) {
  axios.get('https://ccb-destiny.com/api/xur').then(async function(response){
    if( response.status === 200 ) {
      let is_xur_up = response.data.is_xur_up ? response.data.is_xur_up : 0;
      let location = response.data.location ? response.data.location : "";
      let items = response.data.items.map(i => i.name).join(", ");
      let msg = '';

      if( is_xur_up > 0 ) {
        if( location === '' ) {
          msg = `Xûr is up but I have no idea where he is :(`;
        }
        else {
          msg = `Xûr is up at <b>` + location + `</b>`;
        }

        msg += `\nExotics on sale: <b>` + items + `</b>`;
      }
      else {
        msg = `Xûr is not around lah. He spawns on Saturday 1 AM and retires on Wednesday 1 AM.`;
      }

      await ctx.reply(msg, {'parse_mode': 'HTML', 'disable_web_page_preview': true});
    }
  });
}

function fetchDisplayFunFacts(ctx) {
  ccbPool.then(async function(pool){
    await pool.query("SELECT * FROM fun_facts WHERE status='active' ORDER BY RAND() LIMIT 1").then(async function(res){
      if( res.length > 0 ) {
        await ctx.reply( "Fun Fact #" + res[0].id + ": " + res[0].fact );
      }
    });
  })
}

function toggleNotification(ctx, help=false) {
  ctx.getChat().then(function(chat){
    telegramPool.then(async function(pool){

      await pool.query("SELECT * FROM channels WHERE chat_id = ?", [chat_id]).then(async function(res){
        if( res.length > 0 && res[0].notify == 1 ) {
          await pool.query(
            "UPDATE channels SET notify = 0 WHERE chat_id = ?",
            [chat.id]
          ).then(async function(res){

            if( help == true ) {
              ctx.editMessageReplyMarkup({
                inline_keyboard: getMenuArr("on")
              })
            }
            else {
              ctx.editMessageReplyMarkup({
                inline_keyboard: [ [ { text: 'Turn on notifications', callback_data: 'notify:a' } ] ]
              })
            }

            ctx.reply('Notification of new lfg events have been <b>disabled</b>.', {'parse_mode': 'HTML', 'disable_web_page_preview': true});
          });
        }
        else {
          await pool.query(
            "UPDATE channels SET notify = 1 WHERE chat_id = ?",
            [chat.id]
          ).then(async function(res){

            if( help == true ) {
              ctx.editMessageReplyMarkup({
                inline_keyboard: getMenuArr("off")
              })
            }
            else {
              ctx.editMessageReplyMarkup({
                inline_keyboard: [ [ { text: 'Turn off notifications', callback_data: 'notify:a' } ] ]
              })
            }

            ctx.reply('Notification of new lfg events have been <b>enabled</b>.', {'parse_mode': 'HTML', 'disable_web_page_preview': true});
          });
        }
      });
    })
  });
}

async function updateChatID(message) {

  let first_name = message.chat.first_name ? message.chat.first_name : '';
  let last_name = message.chat.last_name ? message.chat.last_name : '';
  let username = message.chat.username ? message.chat.username : '';

  telegramPool.then(async function(pool){
    await pool.query(
      "INSERT INTO channels (chat_id, first_name, last_name, username, type, date_added) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE first_name = ?, last_name = ?, username = ?, type = ?, date_added = ?",
      [message.chat.id, first_name, last_name, username, message.chat.type, moment().format('YYYY-M-D HH:mm:ss'), first_name, last_name, username, message.chat.type, moment().format('YYYY-M-D HH:mm:ss')]
    ).then(async function(res){
      return res.affectedRows;
    });
  })
}

async function fetchDisplayEvents(ctx) {

  discordPool.then(async function(pool){
    await pool.query("SELECT * FROM event WHERE server_id = ? AND status = ? AND channel_id NOT IN (?) ORDER BY event_date ASC", [config.clanDiscordID, 'active', config.ignoreChannelIDs]).then(async function(res){

      if( res.length == 0 ) {
        ctx.reply("No events have been scheduled");
      }
      else {

        // Events
        await ctx.reply('<b><u>CCB LFG Event'+( res.length > 1 ? 's' : '' )+' as of '+moment().format('D MMM h:mm A')+'</u></b>', {'parse_mode': 'HTML', 'disable_web_page_preview': true});

        for(var i=0; i<res.length; i++) {

          let no = i + 1;
          let event_name = res[i].event_name.replace(/<@!.*>/g, "*Discord User*").replace(/<.*>/g, "");
          let event_description = res[i].event_description.replace(/<@!.*>/g, "*Discord User*").replace(/<.*>/g, "");
          let event_date = moment( res[i].event_date ).format('D MMM h:mm A, dddd');
          let event_title = res[i].event_name.match(/\[(.*)\]/);

          if( event_title[1] ) {
            event_name = event_title[1];
          }

          let msg =
          //`***************************************************`+
          `\n<b>`+no+`. `+event_name+` @ `+event_date+`</b>`;

          if( event_description.trim().length > 0 ) {
            msg += `\n\n`+event_description.trim();
          }

          msg += `\n\n<i>By: `+res[i].created_by_username.trim()+` • <a href="https://discordapp.com/channels/`+res[i].server_id+`/`+res[i].channel_id+`/`+res[i].message_id+`">Weblink</a></i>\n`;

          await ctx.reply(msg, {'parse_mode': 'HTML', 'disable_web_page_preview': true});
        }
      }
    });
  })
}
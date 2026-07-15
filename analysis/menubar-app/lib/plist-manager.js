const { execFile } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const PLIST_BUDDY = '/usr/libexec/PlistBuddy';
const LABEL = 'com.studyai.nightly';

class PlistManager {
  constructor(options = {}) {
    this.plistPath = options.plistPath || path.join(os.homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
    this.uid = options.uid ?? process.getuid();
    this.execFile = options.execFile || execFileAsync;
  }

  async command(command) {
    const { stdout } = await this.execFile(PLIST_BUDDY, ['-c', command, this.plistPath]);
    return stdout.trim();
  }

  async print(key) {
    try {
      return await this.command(`Print :${key}`);
    } catch (error) {
      if (/Does Not Exist|Entry, .* Does Not Exist/.test(`${error.stderr || ''}${error.message || ''}`)) return null;
      throw error;
    }
  }

  async isLoaded() {
    try {
      await this.execFile('/bin/launchctl', ['print', `gui/${this.uid}/${LABEL}`]);
      return true;
    } catch {
      return false;
    }
  }

  async getConfig() {
    const [hour, minute, engine, model, enabled] = await Promise.all([
      this.print('StartCalendarInterval:Hour'),
      this.print('StartCalendarInterval:Minute'),
      this.print('EnvironmentVariables:STUDY_AI_AGENT_CLI'),
      this.print('EnvironmentVariables:STUDY_AI_AGENT_MODEL'),
      this.isLoaded(),
    ]);

    return {
      engine: engine === 'codex' ? 'codex' : 'claude',
      model: model || 'default',
      hour: toInteger(hour, 23),
      minute: toInteger(minute, 30),
      enabled,
      plistPath: this.plistPath,
    };
  }

  async setEngine(engine) {
    if (!['claude', 'codex'].includes(engine)) throw new Error('エンジンは claude または codex を指定してください');
    const wasLoaded = await this.isLoaded();

    if ((await this.print('EnvironmentVariables')) === null) {
      await this.command('Add :EnvironmentVariables dict');
    }
    if ((await this.print('EnvironmentVariables:STUDY_AI_AGENT_CLI')) === null) {
      await this.command(`Add :EnvironmentVariables:STUDY_AI_AGENT_CLI string ${engine}`);
    } else {
      await this.command(`Set :EnvironmentVariables:STUDY_AI_AGENT_CLI ${engine}`);
    }

    if (wasLoaded) await this.reload();
    return this.getConfig();
  }

  async setModel(model) {
    const normalized = `${model || 'default'}`.trim();
    if (!/^[A-Za-z0-9._:-]+$/.test(normalized)) throw new Error('モデル名に使用できない文字が含まれています');
    const wasLoaded = await this.isLoaded();
    if ((await this.print('EnvironmentVariables')) === null) await this.command('Add :EnvironmentVariables dict');
    if ((await this.print('EnvironmentVariables:STUDY_AI_AGENT_MODEL')) === null) await this.command(`Add :EnvironmentVariables:STUDY_AI_AGENT_MODEL string ${normalized}`);
    else await this.command(`Set :EnvironmentVariables:STUDY_AI_AGENT_MODEL ${normalized}`);
    if (wasLoaded) await this.reload();
    return this.getConfig();
  }

  async setSchedule(hour, minute) {
    const normalizedHour = Number(hour);
    const normalizedMinute = Number(minute);
    if (!Number.isInteger(normalizedHour) || normalizedHour < 0 || normalizedHour > 23) throw new Error('時は 0〜23 で指定してください');
    if (!Number.isInteger(normalizedMinute) || normalizedMinute < 0 || normalizedMinute > 59) throw new Error('分は 0〜59 で指定してください');
    const wasLoaded = await this.isLoaded();

    await this.upsertInteger('StartCalendarInterval:Hour', normalizedHour);
    await this.upsertInteger('StartCalendarInterval:Minute', normalizedMinute);
    if (wasLoaded) await this.reload();
    return this.getConfig();
  }

  async upsertInteger(key, value) {
    if ((await this.print(key)) === null) await this.command(`Add :${key} integer ${value}`);
    else await this.command(`Set :${key} ${value}`);
  }

  async setEnabled(enabled) {
    const loaded = await this.isLoaded();
    if (enabled && !loaded) await this.bootstrap();
    if (!enabled && loaded) await this.bootout();
    return this.getConfig();
  }

  async bootout() {
    try {
      await this.execFile('/bin/launchctl', ['bootout', `gui/${this.uid}`, this.plistPath]);
    } catch (error) {
      if (!/Could not find service|No such process|service is not loaded/i.test(`${error.stderr || ''}${error.message || ''}`)) throw error;
    }
  }

  async bootstrap() {
    await this.execFile('/bin/launchctl', ['bootstrap', `gui/${this.uid}`, this.plistPath]);
  }

  async reload() {
    await this.bootout();
    await this.bootstrap();
  }
}

function toInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

module.exports = { LABEL, PlistManager, toInteger };

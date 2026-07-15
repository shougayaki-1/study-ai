const fs = require('node:fs/promises');
const path = require('node:path');

const LOG_NAME_PATTERN = /^(nightly|manual)-(\d{8})(?:-(\d{6}))?\.log$/;
const ERROR_PATTERN = /(^|\n).{0,100}(error|failed|failure|fatal|exception|traceback|permission denied|command not found|未知の STUDY_AI_AGENT_CLI).{0,160}/i;

class LogService {
  constructor(tmpDir) {
    this.tmpDir = tmpDir;
  }

  async list(limit = 20) {
    await fs.mkdir(this.tmpDir, { recursive: true });
    const entries = await fs.readdir(this.tmpDir, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isFile() && LOG_NAME_PATTERN.test(entry.name))
      .map((entry) => entry.name);

    const logs = await Promise.all(candidates.map(async (name) => {
      const filePath = path.join(this.tmpDir, name);
      const [stats, content] = await Promise.all([fs.stat(filePath), fs.readFile(filePath, 'utf8')]);
      const match = name.match(LOG_NAME_PATTERN);
      return {
        name,
        trigger: match[1] === 'manual' ? 'manual' : 'scheduled',
        timestamp: stats.mtime.toISOString(),
        size: stats.size,
        status: classifyLog(content),
      };
    }));

    return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
  }

  async read(name) {
    if (!LOG_NAME_PATTERN.test(name) || path.basename(name) !== name) throw new Error('不正なログファイル名です');
    const filePath = path.join(this.tmpDir, name);
    const content = await fs.readFile(filePath, 'utf8');
    return { name, content, status: classifyLog(content) };
  }

  async latest(trigger) {
    const logs = await this.list(20);
    return logs.find((log) => log.trigger === trigger) || null;
  }
}

function classifyLog(content) {
  if (!content.trim()) return 'unknown';
  return ERROR_PATTERN.test(content) ? 'failure' : 'success';
}

function manualLogName(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `manual-${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}.log`;
}

module.exports = { ERROR_PATTERN, LOG_NAME_PATTERN, LogService, classifyLog, manualLogName };

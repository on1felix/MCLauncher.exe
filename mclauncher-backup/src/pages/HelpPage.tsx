import { motion } from 'framer-motion';
import { HelpCircle, Zap, Clipboard, Settings2, Rocket, Sparkles, Globe, ShieldX, Users, HardDrive, ShieldCheck, Puzzle } from 'lucide-react';

const steps = [
  {
    icon: Clipboard,
    title: 'Шаг 1. Получите конфиг запуска',
    body: (
      <>
        <p>Конфиг — это строка Command line, с которой запускается Minecraft. Взять её можно двумя способами:</p>
        <div className="mt-3 space-y-2">
          <div className="rounded-lg bg-bg-2/60 border border-border p-3">
            <div className="text-white/90 font-medium mb-1.5 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-accent" />
              Способ 1 — Автозахват (рекомендуется)
            </div>
            <ol className="list-decimal list-inside text-text-secondary space-y-1">
              <li>Запустите Minecraft через официальный Minecraft Launcher</li>
              <li>Зайдите в мир или дождитесь главного меню</li>
              <li>В лаунчере откройте раздел <span className="text-white/90">«Вставить конфиг»</span></li>
              <li>Раскройте виджет <span className="text-white/90">«Автозахват конфига»</span> и нажмите <span className="text-accent">«Захватить конфиг»</span></li>
              <li>Профиль создастся и активируется автоматически</li>
            </ol>
          </div>
          <div className="rounded-lg bg-bg-2/60 border border-border p-3">
            <div className="text-white/90 font-medium mb-1.5 flex items-center gap-1.5">
              <Clipboard className="w-3.5 h-3.5 text-accent" />
              Способ 2 — Вручную (System Informer)
            </div>
            <ol className="list-decimal list-inside text-text-secondary space-y-1">
              <li>Запустите Minecraft через официальный лаунчер</li>
              <li>Откройте <span className="text-white/90">System Informer</span> (бесплатный аналог диспетчера задач)</li>
              <li>Найдите процесс <span className="text-white/90">java.exe</span> в списке процессов</li>
              <li>Откройте его свойства → вкладка <span className="text-white/90">«Properties»</span></li>
              <li>Скопируйте содержимое поля <span className="text-white/90">Command line</span> целиком</li>
              <li>Вставьте строку в раздел <span className="text-white/90">«Вставить конфиг»</span>, укажите название и нажмите <span className="text-accent">«Сохранить профиль»</span></li>
            </ol>
          </div>
        </div>
      </>
    ),
  },
  {
    icon: Settings2,
    title: 'Шаг 2. Настройте параметры',
    body: (
      <ul className="list-disc list-inside text-text-secondary space-y-1.5">
        <li>Выберите профиль в разделе <span className="text-white/90">«Профили»</span> — клик по профилю делает его активным</li>
        <li>В разделе <span className="text-white/90">«Настройки»</span> укажите количество памяти (RAM) и никнейм</li>
        <li>Память и никнейм подставятся в игру автоматически</li>
      </ul>
    ),
  },
  {
    icon: Rocket,
    title: 'Шаг 3. Запустите игру',
    body: (
      <ul className="list-disc list-inside text-text-secondary space-y-1.5">
        <li>Откройте <span className="text-white/90">«Главную»</span> и нажмите <span className="text-accent">«Запустить Minecraft»</span></li>
        <li>Игра запустится с теми же параметрами, что и в оригинальном лаунчере</li>
      </ul>
    ),
  },
  {
    icon: Sparkles,
    title: 'Новая версия Minecraft',
    body: (
      <p>
        Чтобы создать профиль другой версии — просто запустите нужную версию
        в официальном лаунчере, сделайте автозахват конфига, и всё готово.
        Профиль создастся сам, можно запускать и наслаждаться игрой.
      </p>
    ),
  },
  {
    icon: Puzzle,
    title: 'Моды',
    body: (
      <>
        <p>
          Мод — это дополнение, которое меняет или добавляет что-то в игру:
          миникарты, новые предметы, оптимизацию и многое другое. В MCLauncher
          встроен каталог Modrinth — крупнейшего хранилища модов, где всё
          проверено и безопасно.
        </p>
        <ul className="list-disc list-inside mt-3 space-y-1.5">
          <li>Откройте раздел <span className="text-white/90">«Моды»</span> — там каталог модов и ресурспаков с поиском</li>
          <li>Выберите версию игры и загрузчик (Fabric/Forge) — список покажет только совместимое</li>
          <li>Нажмите <span className="text-accent">«Установить»</span> — лаунчер сам скачает нужную версию мода и положит её в папку игры</li>
          <li>В разделе <span className="text-white/90">«Моды клиента»</span> лежат моды, которые уже идут в комплекте с MCLauncher — они ставятся в один клик</li>
          <li>Удалить мод можно тут же, в разделе <span className="text-white/90">«Установлено»</span></li>
        </ul>
        <p className="mt-3">
          Всё устанавливается автоматически: не нужно ничего скачивать вручную,
          искать папки или разбираться с версиями — выбрали мод, нажали кнопку,
          запустили игру.
        </p>
      </>
    ),
  },
];

export function HelpPage() {
  return (
    <div className="max-w-[1600px] mx-auto w-full transition-[max-width] duration-300 ease-out">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center gap-2 mb-6">
          <HelpCircle className="w-5 h-5 text-accent" />
          <h2 className="text-2xl font-semibold">Инструкция</h2>
        </div>

        {/* Принцип работы */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-bg/50 rounded-lg border border-border p-6 gradient-border mb-4"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center flex-shrink-0 shadow-[0_0_16px_rgba(255,123,29,0.2)]">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white/90">Как это работает</h3>
              <p className="text-xs text-text-secondary">Принцип работы приложения</p>
            </div>
          </div>

          <p className="text-sm text-text-secondary leading-relaxed">
            MCLauncher — это удобная обёртка над вашим Minecraft. В один клик он берёт
            точную строку запуска (<span className="text-white/90">Command line</span>), которой игру запускает
            официальный лаунчер, подставляет ваш никнейм и нужное количество памяти — и
            запускает игру напрямую. Вы получаете ту же игру, те же версии и моды, только
            без привязки к лицензионному аккаунту.
          </p>

          <div className="mt-4 grid gap-2.5">
            <div className="rounded-lg bg-bg-2/60 border border-border p-3.5 flex gap-3">
              <ShieldX className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-white/90 mb-1">Где играть не получится</div>
                <p className="text-sm text-text-secondary leading-relaxed">
                  На крупных серверах с проверкой лицензии — например <span className="text-white/90">Hypixel</span> —
                  войти не выйдет: они проверяют учётную запись через Mojang/Microsoft и
                  откажут в доступе, если лицензии нет.
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-bg-2/60 border border-border p-3.5 flex gap-3">
              <Globe className="w-5 h-5 text-accent shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-white/90 mb-1">Где играть можно</div>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Зато на серверах, где лицензия не проверяется, играть можно — и таких очень
                  много: <span className="text-white/90">ReallyWorld</span>, <span className="text-white/90">FUN TIME</span>
                  {' '}и десятки других похожих проектов.
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-bg-2/60 border border-border p-3.5 flex gap-3">
              <Users className="w-5 h-5 text-accent shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-white/90 mb-1">Играйте с друзьями</div>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Вы можете играть вместе с друзьями, даже если у них лицензионная версия игры —
                  вы просто встретитесь на одном и том же сервере.
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-bg-2/60 border border-border p-3.5 flex gap-3">
              <HardDrive className="w-5 h-5 text-accent shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-white/90 mb-1">Экономия места на диске</div>
                <p className="text-sm text-text-secondary leading-relaxed">
                  MCLauncher ничего не скачивает и не копирует — он запускает ровно те файлы,
                  что вы скачали через официальный лаунчер Minecraft. Никаких лишних гигабайтов
                  на диске и мусора в системе.
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-bg-2/60 border border-border p-3.5 flex gap-3">
              <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-white/90 mb-1">Безопасность и лёгкость</div>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Другие лаунчеры — вроде <span className="text-white/90">TLauncher</span> или{' '}
                  <span className="text-white/90">KLauncher</span> — раздуты рекламой, постоянно
                  пишут данные в разные папки сотнями мегабайт и могут быть вредоносными.
                  MCLauncher в 100 раз легче и делает ровно то же самое, что и они, только
                  намного чище: без рекламы, без мусорных файлов на сотни мегабайт —
                  ничего лишнего, только запуск игры.
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {steps.map((step, i) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="bg-bg/50 rounded-lg border border-border p-5 gradient-border mb-4"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                <step.icon className="w-4 h-4 text-accent" />
              </div>
              <h3 className="text-sm font-semibold text-white/90">{step.title}</h3>
            </div>
            <div className="text-sm text-text-secondary leading-relaxed">{step.body}</div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
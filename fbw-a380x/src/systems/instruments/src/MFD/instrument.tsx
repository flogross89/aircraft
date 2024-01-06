import { Clock, FSComponent, EventBus, HEventPublisher } from '@microsoft/msfs-sdk';
import { MfdComponent } from './MFD';
import { MfdSimvarPublisher } from './shared/MFDSimvarPublisher';

class A380X_MFD extends BaseInstrument {
    private readonly bus: EventBus;

    private readonly simVarPublisher: MfdSimvarPublisher;

    private readonly hEventPublisher: HEventPublisher;

    private readonly clock: Clock;

    /**
     * "mainmenu" = 0
     * "loading" = 1
     * "briefing" = 2
     * "ingame" = 3
     */
    private gameState = 0;

    constructor() {
        super();
        this.bus = new EventBus();
        this.simVarPublisher = new MfdSimvarPublisher(this.bus);
        this.hEventPublisher = new HEventPublisher(this.bus);
        this.clock = new Clock(this.bus);
    }

    get templateID(): string {
        return 'A380X_MFD';
    }

    get isInteractive(): boolean {
        return true;
    }

    public getDeltaTime() {
        return this.deltaTime;
    }

    public connectedCallback(): void {
        super.connectedCallback();

        this.clock.init();

        FSComponent.render(<MfdComponent bus={this.bus} instrument={this} />, document.getElementById('MFD_CONTENT'));

        // Remove "instrument didn't load" text
        document.getElementById('MFD_CONTENT').querySelector(':scope > h1').remove();
    }

    public onInteractionEvent(args: string[]): void {
        console.warn(args[0]);
        this.hEventPublisher.dispatchHEvent(args[0]);
    }

    /**
   * A callback called when the instrument gets a frame update.
   */
    public Update(): void {
        super.Update();

        if (this.gameState !== 3) {
            const gamestate = this.getGameState();
            if (gamestate === 3) {
                this.simVarPublisher.startPublish();
                this.hEventPublisher.startPublish();
            }
            this.gameState = gamestate;
        } else {
            this.simVarPublisher.onUpdate();
            this.clock.onUpdate();
        }
    }
}

registerInstrument('a380x-mfd', A380X_MFD);
import {Colony} from '../Colony';
import {log} from '../console/log';
import {BoostType} from '../resources/map_resources';
import {CreepSetup} from './CreepSetup';

interface BodyOpts {
	targetMoveSpeed?: number;
	putMoveFirstInBody?: boolean;
	bodyRatio?: {
		attack?: number;
		ranged?: number;
		heal?: number;
		tough?: number;
		work?: number;
	};
	maxParts?: {
		attack?: number;
		ranged?: number;
		heal?: number;
		tough?: number;
		work?: number;
	};
	boosts?: BoostType[];
}

interface SimpleBodyOpts {
	boosted?: boolean;
	armored?: boolean;
	healing?: boolean;
	withRanged?: boolean;
	bodyOpts?: BodyOpts;
}

interface AvailableBoosts {
	attack?: ResourceConstant | undefined;
	ranged?: ResourceConstant | undefined;
	heal?: ResourceConstant | undefined;
	tough?: ResourceConstant | undefined;
	dismantle?: ResourceConstant | undefined;
	move?: ResourceConstant | undefined;
}

interface BodyGeneratorReturn {
	body: BodyPartConstant[];
	boosts: ResourceConstant[];
}

const BOOST_50_PARTS = MAX_CREEP_SIZE * LAB_BOOST_MINERAL;

// to get typings to work since typed-screeps has a hardon for over-typing things
const BOOST_EFFECTS: { [part: string]: { [boost: string]: { [action: string]: number } } } = BOOSTS;

export class CombatCreepSetup extends CreepSetup {


	generateBody(availableEnergy: number): BodyPartConstant[] {
		return []; // TODO
	}

	/**
	 * Returns an object with the best boosts available for each type of boost requested. The object will only have
	 * keys for boosts which are requested in opts.boosts and for which opts.bodyRatio has non-zero entries, and
	 * if a boost is requested but not available, the key will be present but the value will be undefined.
	 */
	private getBestBoostsAvailable(colony: Colony, opts: Full<BodyOpts>): AvailableBoosts {
		const availableBoosts: AvailableBoosts = {};
		if (colony.evolutionChamber) {
			if (opts.bodyRatio.tough && opts.boosts.includes('tough')) {
				const toughBoostNeeded = LAB_BOOST_MINERAL * (opts.maxParts.tough || 0);
				availableBoosts.tough = colony.evolutionChamber.bestBoostAvailable('tough', toughBoostNeeded);
			}
			if (opts.bodyRatio.heal && opts.boosts.includes('heal')) {
				const healBoostNeeded = LAB_BOOST_MINERAL * (opts.maxParts.heal || 0);
				availableBoosts.heal = colony.evolutionChamber.bestBoostAvailable('heal', healBoostNeeded);
			}
			if (opts.bodyRatio.ranged && opts.boosts.includes('ranged')) {
				const rangedBoostNeeded = LAB_BOOST_MINERAL * (opts.maxParts.ranged || 0);
				availableBoosts.ranged = colony.evolutionChamber.bestBoostAvailable('ranged', rangedBoostNeeded);
			}
			if (opts.bodyRatio.work && opts.boosts.includes('dismantle')) {
				const dismantleBoostNeeded = LAB_BOOST_MINERAL * (opts.maxParts.work || 0);
				availableBoosts.dismantle = colony.evolutionChamber.bestBoostAvailable('dismantle', dismantleBoostNeeded);
			}
			if (opts.bodyRatio.attack && opts.boosts.includes('attack')) {
				const attackBoostNeeded = LAB_BOOST_MINERAL * (opts.maxParts.attack || 0);
				availableBoosts.attack = colony.evolutionChamber.bestBoostAvailable('attack', attackBoostNeeded);
			}
			if (opts.boosts.includes('move')) {
				const moveBoostNeeded = LAB_BOOST_MINERAL * 50 / 3; // T1 most boost lets you do move ratio of 2 : 1
				availableBoosts.move = colony.evolutionChamber.bestBoostAvailable('move', moveBoostNeeded);
			}
		}
		return availableBoosts;
	}


	/**
	 * Generate a body array from a count of body parts. We order the body as
	 * TOUGH -> RANGED -> WORK -> ATTACK -> HEAL -> MOVE if opts.putMoveFirstInBody is true, otherwise we order as
	 * TOUGH -> MOVE -> RANGED -> WORK -> ATTACK -> HEAL, and always put a final MOVE part at the end. Although this
	 * ordering is the same for all methods in this class, it isn't possible for example to have a creep with
	 * both attack and ranged parts using the other methods in this class.
	 */
	private arrangeBodyParts(bodyCounts: {
		move: number;
		attack?: number;
		ranged?: number;
		heal?: number;
		tough?: number;
		work?: number;
	}, opts: BodyOpts): BodyPartConstant[] {

		const body: BodyPartConstant[] = [];
		_.forEach(_.range(bodyCounts.tough || 0), i => body.push(TOUGH));
		if (opts.putMoveFirstInBody) {
			_.forEach(_.range(bodyCounts.move - 1), i => body.push(MOVE));
			_.forEach(_.range(bodyCounts.ranged || 0), i => body.push(RANGED_ATTACK));
			_.forEach(_.range(bodyCounts.work || 0), i => body.push(WORK));
			_.forEach(_.range(bodyCounts.attack || 0), i => body.push(ATTACK));
			_.forEach(_.range(bodyCounts.heal || 0), i => body.push(HEAL));
		} else {
			_.forEach(_.range(bodyCounts.ranged || 0), i => body.push(RANGED_ATTACK));
			_.forEach(_.range(bodyCounts.work || 0), i => body.push(WORK));
			_.forEach(_.range(bodyCounts.attack || 0), i => body.push(ATTACK));
			_.forEach(_.range(bodyCounts.move - 1), i => body.push(MOVE));
			_.forEach(_.range(bodyCounts.heal || 0), i => body.push(HEAL));
		}
		body.push(MOVE);
		return body;
	}


	/**
	 * Creates a body plan for a creep with body ratios based around melee attack parts. The method will try to create
	 * the largest creep which can be spawned from a colony, which has a target move speed after the best available
	 * requested move boosts are applied, which has a body ratio specified by opts.bodyRatio, and where max part
	 * counts are capped by opts.maxParts.
	 */
	private generateMeleeAttackerBody(colony: Colony, opts: Full<BodyOpts>): BodyGeneratorReturn {

		if (!opts.bodyRatio.attack) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; No attack!`);
			return {body: [], boosts: []};
		}
		if (opts.bodyRatio.work) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; using work parts requires dismantler body!`);
			return {body: [], boosts: []};
		}
		if (opts.bodyRatio.ranged) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; using ranged parts requires ranged body!`);
			return {body: [], boosts: []};
		}

		const DEFAULT_MAX_PARTS_MELEE = {attack: 50, tough: 10, heal: 2};
		opts.maxParts.attack = opts.maxParts.attack || DEFAULT_MAX_PARTS_MELEE.attack;
		opts.maxParts.tough = opts.maxParts.tough || DEFAULT_MAX_PARTS_MELEE.tough;
		opts.maxParts.heal = opts.maxParts.heal || DEFAULT_MAX_PARTS_MELEE.heal;

		const availableBoosts = this.getBestBoostsAvailable(colony, opts);

		if (!availableBoosts.tough) { // no point in adding tough parts if they can't be boosted
			opts.bodyRatio.tough = 0;
		}

		const partsPerMovePart = (availableBoosts.move ? BOOST_EFFECTS.move[availableBoosts.move].fatigue : 1)
								 * opts.targetMoveSpeed;

		// We need attack, tough, heal to be defined for bodyRatio and maxParts
		opts.bodyRatio.attack = opts.bodyRatio.attack || 1;
		opts.bodyRatio.tough = opts.bodyRatio.tough || 0;
		opts.bodyRatio.heal = opts.bodyRatio.heal || 0;

		const bodyCounts = {
			tough : opts.bodyRatio.tough > 0 ? 1 : 0,
			heal  : opts.bodyRatio.heal > 0 ? 1 : 0,
			attack: 1,
			move  : 1,
		};

		const maxPartCost = opts.bodyRatio.heal ? BODYPART_COST[HEAL] : BODYPART_COST[ATTACK];

		let cost = BODYPART_COST[TOUGH] * bodyCounts.tough +
				   BODYPART_COST[ATTACK] * bodyCounts.attack +
				   BODYPART_COST[HEAL] * bodyCounts.heal +
				   BODYPART_COST[MOVE] * bodyCounts.move;

		// Keep adding stuff until you run out of space on the body or out of energy capacity in the room
		while (_.sum(bodyCounts) < MAX_CREEP_SIZE && cost <= colony.room.energyCapacityAvailable - maxPartCost) {
			const nonMoveParts = _.sum(bodyCounts) - bodyCounts.move;
			if (nonMoveParts >= partsPerMovePart * bodyCounts.move) {
				bodyCounts.move++;
				cost += BODYPART_COST[MOVE];
			} else if (bodyCounts.tough < opts.maxParts.tough &&
					   bodyCounts.tough * opts.bodyRatio.tough < bodyCounts.attack * opts.bodyRatio.attack) {
				bodyCounts.tough++;
				cost += BODYPART_COST[TOUGH];
			} else if (bodyCounts.heal < opts.maxParts.heal &&
					   bodyCounts.heal * opts.bodyRatio.heal < bodyCounts.attack * opts.bodyRatio.attack) {
				bodyCounts.heal++;
				cost += BODYPART_COST[HEAL];
			} else {
				bodyCounts.attack++;
				cost += BODYPART_COST[ATTACK];
			}
		}

		const body = this.arrangeBodyParts(bodyCounts, opts);
		const boosts = _.compact(_.values(availableBoosts)) as ResourceConstant[];
		return {body: body, boosts: boosts};

	}


	/**
	 * Creates a body plan for a creep with body ratios based around ranged attack parts. The method will try to create
	 * the largest creep which can be spawned from a colony, which has a target move speed after the best available
	 * requested move boosts are applied, which has a body ratio specified by opts.bodyRatio, and where max part
	 * counts are capped by opts.maxParts.
	 */
	private generateRangedAttackerBody(colony: Colony, opts: Full<BodyOpts>): BodyGeneratorReturn {

		if (!opts.bodyRatio.ranged) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; No ranged!`);
			return {body: [], boosts: []};
		}
		if (opts.bodyRatio.work) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; using work parts requires dismantler body!`);
			return {body: [], boosts: []};
		}
		if (opts.bodyRatio.attack) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; using ranged parts requires melee body!`);
			return {body: [], boosts: []};
		}

		const DEFAULT_MAX_PARTS_RANGED = {ranged: 40, tough: 10, heal: 20};
		opts.maxParts.ranged = opts.maxParts.ranged || DEFAULT_MAX_PARTS_RANGED.ranged;
		opts.maxParts.tough = opts.maxParts.tough || DEFAULT_MAX_PARTS_RANGED.tough;
		opts.maxParts.heal = opts.maxParts.heal || DEFAULT_MAX_PARTS_RANGED.heal;

		const availableBoosts = this.getBestBoostsAvailable(colony, opts);

		if (!availableBoosts.tough) { // no point in adding tough parts if they can't be boosted
			opts.bodyRatio.tough = 0;
		}

		const partsPerMovePart = (availableBoosts.move ? BOOST_EFFECTS.move[availableBoosts.move].fatigue : 1)
								 * opts.targetMoveSpeed;

		// We need ranged, tough, heal to be defined for bodyRatio and maxParts
		opts.bodyRatio.ranged = opts.bodyRatio.ranged || 1;
		opts.bodyRatio.tough = opts.bodyRatio.tough || 0;
		opts.bodyRatio.heal = opts.bodyRatio.heal || 0;

		const bodyCounts = {
			tough : opts.bodyRatio.tough > 0 ? 1 : 0,
			heal  : opts.bodyRatio.heal > 0 ? 1 : 0,
			ranged: 1,
			move  : 1,
		};

		const maxPartCost = opts.bodyRatio.heal ? BODYPART_COST[HEAL] : BODYPART_COST[RANGED_ATTACK];

		let cost = BODYPART_COST[TOUGH] * bodyCounts.tough +
				   BODYPART_COST[RANGED_ATTACK] * bodyCounts.ranged +
				   BODYPART_COST[HEAL] * bodyCounts.heal +
				   BODYPART_COST[MOVE] * bodyCounts.move;

		// Keep adding stuff until you run out of space on the body or out of energy capacity in the room
		while (_.sum(bodyCounts) < MAX_CREEP_SIZE && cost <= colony.room.energyCapacityAvailable - maxPartCost) {
			const nonMoveParts = _.sum(bodyCounts) - bodyCounts.move;
			if (nonMoveParts >= partsPerMovePart * bodyCounts.move) {
				bodyCounts.move++;
				cost += BODYPART_COST[MOVE];
			} else if (bodyCounts.tough < opts.maxParts.tough &&
					   bodyCounts.tough * opts.bodyRatio.tough < bodyCounts.ranged * opts.bodyRatio.ranged) {
				bodyCounts.tough++;
				cost += BODYPART_COST[TOUGH];
			} else if (bodyCounts.heal < opts.maxParts.heal &&
					   bodyCounts.heal * opts.bodyRatio.heal < bodyCounts.ranged * opts.bodyRatio.ranged) {
				bodyCounts.heal++;
				cost += BODYPART_COST[HEAL];
			} else {
				bodyCounts.ranged++;
				cost += BODYPART_COST[RANGED_ATTACK];
			}
		}

		const body = this.arrangeBodyParts(bodyCounts, opts);
		const boosts = _.compact(_.values(availableBoosts)) as ResourceConstant[];
		return {body: body, boosts: boosts};

	}


	/**
	 * Creates a body plan for a creep with body ratios based around heal parts. The method will try to create
	 * the largest creep which can be spawned from a colony, which has a target move speed after the best available
	 * requested move boosts are applied, which has a body ratio specified by opts.bodyRatio, and where max part
	 * counts are capped by opts.maxParts.
	 */
	private generateHealerBody(colony: Colony, opts: Full<BodyOpts>): BodyGeneratorReturn {

		if (!opts.bodyRatio.heal) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; No heal!`);
			return {body: [], boosts: []};
		}
		if (opts.bodyRatio.work) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; using work parts requires dismantler body!`);
			return {body: [], boosts: []};
		}
		if (opts.bodyRatio.attack) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; using ranged parts requires melee body!`);
			return {body: [], boosts: []};
		}

		const DEFAULT_MAX_PARTS_HEAL = {heal: 40, tough: 10, ranged: 30};
		opts.maxParts.heal = opts.maxParts.heal || DEFAULT_MAX_PARTS_HEAL.heal;
		opts.maxParts.ranged = opts.maxParts.ranged || DEFAULT_MAX_PARTS_HEAL.ranged;
		opts.maxParts.tough = opts.maxParts.tough || DEFAULT_MAX_PARTS_HEAL.tough;

		const availableBoosts = this.getBestBoostsAvailable(colony, opts);

		if (!availableBoosts.tough) { // no point in adding tough parts if they can't be boosted
			opts.bodyRatio.tough = 0;
		}

		const partsPerMovePart = (availableBoosts.move ? BOOST_EFFECTS.move[availableBoosts.move].fatigue : 1)
								 * opts.targetMoveSpeed;

		// We need ranged, tough, heal to be defined for bodyRatio and maxParts
		opts.bodyRatio.heal = opts.bodyRatio.heal || 1;
		opts.bodyRatio.tough = opts.bodyRatio.tough || 0;
		opts.bodyRatio.ranged = opts.bodyRatio.ranged || 0;

		const bodyCounts = {
			tough : opts.bodyRatio.tough > 0 ? 1 : 0,
			ranged: opts.bodyRatio.ranged > 0 ? 1 : 0,
			heal  : 1,
			move  : 1,
		};

		const maxPartCost = BODYPART_COST[HEAL];

		let cost = BODYPART_COST[TOUGH] * bodyCounts.tough +
				   BODYPART_COST[RANGED_ATTACK] * bodyCounts.ranged +
				   BODYPART_COST[HEAL] * bodyCounts.heal +
				   BODYPART_COST[MOVE] * bodyCounts.move;

		// Keep adding stuff until you run out of space on the body or out of energy capacity in the room
		while (_.sum(bodyCounts) < MAX_CREEP_SIZE && cost <= colony.room.energyCapacityAvailable - maxPartCost) {
			const nonMoveParts = _.sum(bodyCounts) - bodyCounts.move;
			if (nonMoveParts >= partsPerMovePart * bodyCounts.move) {
				bodyCounts.move++;
				cost += BODYPART_COST[MOVE];
			} else if (bodyCounts.tough < opts.maxParts.tough &&
					   bodyCounts.tough * opts.bodyRatio.tough < bodyCounts.heal * opts.bodyRatio.heal) {
				bodyCounts.tough++;
				cost += BODYPART_COST[TOUGH];
			} else if (bodyCounts.ranged < opts.maxParts.ranged &&
					   bodyCounts.ranged * opts.bodyRatio.ranged < bodyCounts.heal * opts.bodyRatio.heal) {
				bodyCounts.ranged++;
				cost += BODYPART_COST[RANGED_ATTACK];
			} else {
				bodyCounts.heal++;
				cost += BODYPART_COST[HEAL];
			}
		}

		const body = this.arrangeBodyParts(bodyCounts, opts);
		const boosts = _.compact(_.values(availableBoosts)) as ResourceConstant[];
		return {body: body, boosts: boosts};

	}


	/**
	 * Creates a body plan for a creep with body ratios based around work parts. The method will try to create
	 * the largest creep which can be spawned from a colony, which has a target move speed after the best available
	 * requested move boosts are applied, which has a body ratio specified by opts.bodyRatio, and where max part
	 * counts are capped by opts.maxParts.
	 */
	private generateDismantlerBody(colony: Colony, opts: Full<BodyOpts>): BodyGeneratorReturn {

		if (!opts.bodyRatio.work) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; No dismantle!`);
			return {body: [], boosts: []};
		}
		if (opts.bodyRatio.attack) {
			log.error(`Bad opts.bodyRatio: ${opts.bodyRatio}; using attack parts requires melee body!`);
			return {body: [], boosts: []};
		}

		const DEFAULT_MAX_PARTS_DISMANTLER = {work: 40, tough: 10, ranged: 10, heal: 2};
		opts.maxParts.work = opts.maxParts.work || DEFAULT_MAX_PARTS_DISMANTLER.work;
		opts.maxParts.ranged = opts.maxParts.ranged || DEFAULT_MAX_PARTS_DISMANTLER.ranged;
		opts.maxParts.tough = opts.maxParts.tough || DEFAULT_MAX_PARTS_DISMANTLER.tough;
		opts.maxParts.heal = opts.maxParts.heal || DEFAULT_MAX_PARTS_DISMANTLER.heal;

		const availableBoosts = this.getBestBoostsAvailable(colony, opts);

		if (!availableBoosts.tough) { // no point in adding tough parts if they can't be boosted
			opts.bodyRatio.tough = 0;
		}

		const partsPerMovePart = (availableBoosts.move ? BOOST_EFFECTS.move[availableBoosts.move].fatigue : 1)
								 * opts.targetMoveSpeed;

		// We need work, ranged, tough, heal to be defined for bodyRatio and maxParts
		opts.bodyRatio.work = opts.bodyRatio.work || 1;
		opts.bodyRatio.ranged = opts.bodyRatio.ranged || 0;
		opts.bodyRatio.tough = opts.bodyRatio.tough || 0;
		opts.bodyRatio.heal = opts.bodyRatio.heal || 0;

		const bodyCounts = {
			tough : opts.bodyRatio.tough > 0 ? 1 : 0,
			heal  : opts.bodyRatio.heal > 0 ? 1 : 0,
			ranged: opts.bodyRatio.ranged > 0 ? 1 : 0,
			work  : 1,
			move  : 1,
		};

		const maxPartCost = opts.bodyRatio.heal ? BODYPART_COST[HEAL]
												: opts.bodyRatio.ranged ? BODYPART_COST[RANGED_ATTACK]
																		: BODYPART_COST[WORK];

		let cost = BODYPART_COST[TOUGH] * bodyCounts.tough +
				   BODYPART_COST[RANGED_ATTACK] * bodyCounts.ranged +
				   BODYPART_COST[WORK] * bodyCounts.work +
				   BODYPART_COST[HEAL] * bodyCounts.heal +
				   BODYPART_COST[MOVE] * bodyCounts.move;

		// Keep adding stuff until you run out of space on the body or out of energy capacity in the room
		while (_.sum(bodyCounts) < MAX_CREEP_SIZE && cost <= colony.room.energyCapacityAvailable - maxPartCost) {
			const nonMoveParts = _.sum(bodyCounts) - bodyCounts.move;
			if (nonMoveParts >= partsPerMovePart * bodyCounts.move) {
				bodyCounts.move++;
				cost += BODYPART_COST[MOVE];
			} else if (bodyCounts.tough < opts.maxParts.tough &&
					   bodyCounts.tough * opts.bodyRatio.tough < bodyCounts.work * opts.bodyRatio.work) {
				bodyCounts.tough++;
				cost += BODYPART_COST[TOUGH];
			} else if (bodyCounts.ranged < opts.maxParts.ranged &&
					   bodyCounts.ranged * opts.bodyRatio.ranged < bodyCounts.work * opts.bodyRatio.work) {
				bodyCounts.ranged++;
				cost += BODYPART_COST[RANGED_ATTACK];
			} else if (bodyCounts.heal < opts.maxParts.heal &&
					   bodyCounts.heal * opts.bodyRatio.heal < bodyCounts.work * opts.bodyRatio.work) {
				bodyCounts.heal++;
				cost += BODYPART_COST[HEAL];
			} else {
				bodyCounts.work++;
				cost += BODYPART_COST[WORK];
			}
		}

		const body = this.arrangeBodyParts(bodyCounts, opts);
		const boosts = _.compact(_.values(availableBoosts)) as ResourceConstant[];
		return {body: body, boosts: boosts};

	}


	/**
	 * Creates a body for a zergling (melee attacker). Takes an object of possible options:
	 * - If opts.boosted is true, all parts are requested to be boosted
	 * - If opts.armored is true, a 3:1 attack:tough ratio will be used up to 10 tough parts
	 * - If opts.healing is true, up to 2 heal parts will be added
	 * - Specifying opts.bodyOpts may override any of the behaviors above
	 */
	createZerglingBody(colony: Colony, opts: SimpleBodyOpts = {}) {
		_.defaults(opts, {boosted: false, armored: false, healing: false, bodyOpts: {}});
		const zerglingBodyOpts: Full<BodyOpts> = {
			targetMoveSpeed   : 1,
			putMoveFirstInBody: true,
			bodyRatio         : {attack: 30, tough: opts.armored ? 10 : 0, heal: opts.healing ? 2 : 0},
			maxParts          : {attack: 50, tough: 10, heal: 2},
			boosts            : opts.boosted ? ['attack', 'tough', 'heal', 'move'] : [],
		};
		const bodyOpts: Full<BodyOpts> = _.defaults(opts.bodyOpts || {}, zerglingBodyOpts);
		this.generateMeleeAttackerBody(colony, bodyOpts);
	}

	/**
	 * Creates a body for a hydralisk (ranged attacker which may have some healing). Possible optoins:
	 * - If opts.boosted is true, all parts are requested to be boosted
	 * - If opts.armored is true, a 4:1 ranged:tough ratio will be used up to 8 tough parts
	 * - If opts.healing is true, a 3:1 ranged:heal ratio will be used up to 10 heal parts
	 * - Specifying opts.bodyOpts may override any of the behaviors above
	 */
	createHydraliskBody(colony: Colony, opts: SimpleBodyOpts = {}) {
		_.defaults(opts, {boosted: false, armored: false, healing: false, bodyOpts: {}});
		const hydraliskBodyOpts: Full<BodyOpts> = {
			targetMoveSpeed   : 1,
			putMoveFirstInBody: false,
			bodyRatio         : {ranged: 12, tough: opts.armored ? 3 : 0, heal: opts.healing ? 4 : 0},
			maxParts          : {ranged: 30, tough: 8, heal: 10},
			boosts            : opts.boosted ? ['ranged', 'tough', 'heal', 'move'] : [],
		};
		const bodyOpts: Full<BodyOpts> = _.defaults(opts.bodyOpts || {}, hydraliskBodyOpts);
		this.generateRangedAttackerBody(colony, bodyOpts);
	}

	/**
	 * Creates a body for a transfuser (healer which may have some ranged attack parts). Possible optoins:
	 * - If opts.boosted is true, all parts are requested to be boosted
	 * - If opts.armored is true, a 4:1 heal:tough ratio will be used up to 8 tough parts
	 * - If opts.withRanged is true, a 3:1 heal:ranged ratio will be used up to 10 ranged parts
	 * - Specifying opts.bodyOpts may override any of the behaviors above
	 */
	createTransfuserBody(colony: Colony, opts: SimpleBodyOpts = {}) {
		_.defaults(opts, {boosted: false, armored: false, withRanged: false, bodyOpts: {}});
		const healerBodyOpts: Full<BodyOpts> = {
			targetMoveSpeed   : 1,
			putMoveFirstInBody: false,
			bodyRatio         : {heal: 12, tough: opts.armored ? 3 : 0, ranged: opts.withRanged ? 4 : 0},
			maxParts          : {heal: 30, tough: 8, ranged: 10},
			boosts            : opts.boosted ? ['ranged', 'tough', 'heal', 'move'] : [],
		};
		const bodyOpts: Full<BodyOpts> = _.defaults(opts.bodyOpts || {}, healerBodyOpts);
		this.generateHealerBody(colony, bodyOpts);
	}

	/**
	 * Creates a body for a lurker (dismantler which may have some ranged or healing). Possible optoins:
	 * - If opts.boosted is true, all parts are requested to be boosted
	 * - If opts.armored is true, a 4:1 work:tough ratio will be used up to 10 tough parts
	 * - If opts.withRanged is true, a 3:1 work:ranged ratoi will be used up to 10 ranged parts
	 * - If opts.healing is true, up to 2 heal parts may be added
	 * - Specifying opts.bodyOpts may override any of the behaviors above
	 */
	createLurkerBody(colony: Colony, opts: SimpleBodyOpts = {}) {
		_.defaults(opts, {boosted: false, armored: false, healing: false, bodyOpts: {}});
		const lurkerBodyOptions: Full<BodyOpts> = {
			targetMoveSpeed   : 1,
			putMoveFirstInBody: false,
			bodyRatio         : {work: 24, tough: opts.armored ? 6 : 0, ranged: opts.withRanged ? 8 : 0, heal: 2},
			maxParts          : {work: 30, tough: 10, ranged: 10, heal: 2},
			boosts            : opts.boosted ? ['dismantle', 'ranged', 'tough', 'heal', 'move'] : [],
		};
		const bodyOpts: Full<BodyOpts> = _.defaults(opts.bodyOpts || {}, lurkerBodyOptions);
		this.generateDismantlerBody(colony, bodyOpts);
	}

}
import rawTopics from './topics.json';

export interface SubTopicNode {
  id: number;
  subjectId: number;
  name: string;
  count: number;
}

export interface TopicNode {
  name: string;
  subTopics: SubTopicNode[];
  count: number; // sum of sub-topics counts
}

export interface SubjectHierarchy {
  subjectId: number;
  topics: TopicNode[];
}

interface RawTopic {
  id: number;
  subjectId: number;
  name: string;
  count: number;
}

const typedRawTopics = rawTopics as RawTopic[];

// Keyword-based classification helper
function classifyTopic(subjectId: number, name: string): string {
  const n = name.toLowerCase();

  switch (subjectId) {
    case 1: // Anatomy
      if (n.includes('cerebrum') || n.includes('brain') || n.includes('neuro') || n.includes('spinal cord')) {
        return 'Neuroanatomy';
      }
      if (n.includes('embryology') || n.includes('development') || n.includes('week') || n.includes('histology') || n.includes('umbilical') || n.includes('diaphragm')) {
        return 'Embryology & Histology';
      }
      if (n.includes('git') || n.includes('g.i.t') || n.includes('urinary') || n.includes('respiratory') || n.includes('pelvis') || n.includes('urology') || n.includes('thorax') || n.includes('abdomen') || n.includes('abdominal')) {
        return 'Systemic Anatomy';
      }
      if (n.includes('extremity') || n.includes('arm') || n.includes('forearm') || n.includes('cubital') || n.includes('axilla') || n.includes('brachial') || n.includes('pectoral') || n.includes('inguinal') || n.includes('femoral') || n.includes('wall') || n.includes('orbit') || n.includes('foot') || n.includes('bone') || n.includes('joint') || n.includes('muscle')) {
        return 'Gross Anatomy (Regions)';
      }
      return 'General Anatomy & Miscellaneous';

    case 2: // Biochemistry
      if (n.includes('metabolism') || n.includes('biosynthesis') || n.includes('gluconeogenesis') || n.includes('cycle') || n.includes('oxidation') || n.includes('glycolysis') || n.includes('lipid') || n.includes('fatty')) {
        return 'Metabolism';
      }
      if (n.includes('molecular') || n.includes('dna') || n.includes('rna') || n.includes('genetics') || n.includes('replication') || n.includes('transcription') || n.includes('translation') || n.includes('gene')) {
        return 'Molecular Biology & Genetics';
      }
      if (n.includes('vitamin') || n.includes('mineral') || n.includes('enzyme')) {
        return 'Vitamins, Minerals & Enzymes';
      }
      return 'General & Clinical Biochemistry';

    case 3: // Physiology
      if (n.includes('general physiology') || n.includes('cell') || n.includes('transport') || n.includes('membrane')) {
        return 'General & Cell Physiology';
      }
      if (n.includes('cardiovascular') || n.includes('circulation') || n.includes('heart') || n.includes('respiratory') || n.includes('respiration') || n.includes('lung')) {
        return 'Cardiovascular & Respiratory Systems';
      }
      if (n.includes('nervous') || n.includes('cerebellum') || n.includes('brainstem') || n.includes('muscle') || n.includes('nerve') || n.includes('sensory')) {
        return 'Nervous & Muscle Physiology';
      }
      if (n.includes('renal') || n.includes('kidney') || n.includes('gastrointestinal') || n.includes('git') || n.includes('digestive')) {
        return 'Renal & Gastrointestinal Systems';
      }
      if (n.includes('endocrine') || n.includes('hormone') || n.includes('reproductive') || n.includes('gonad') || n.includes('thyroid')) {
        return 'Endocrine & Reproductive Systems';
      }
      return 'General & Clinical Physiology';

    case 4: // Pharmacology
      if (n.includes('general pharmacol') || n.includes('absorption') || n.includes('distribution') || n.includes('metabolism') || n.includes('excretion') || n.includes('pharmacokinetic') || n.includes('pharmacodynamic')) {
        return 'General Pharmacology';
      }
      if (n.includes('autonomic') || n.includes('ans') || n.includes('cns') || n.includes('central nervous') || n.includes('anesthetic') || n.includes('sedative') || n.includes('antidepressant') || n.includes('psychiatric') || n.includes('relaxant')) {
        return 'ANS & CNS Pharmacology';
      }
      if (n.includes('cardiovascular') || n.includes('cvs') || n.includes('antiplatelet') || n.includes('fibrinolytic') || n.includes('diuretic') || n.includes('hypertension')) {
        return 'Cardiovascular & Renal Drugs';
      }
      if (n.includes('chemotherapy') || n.includes('antimicrobial') || n.includes('antibiotic') || n.includes('antifungal') || n.includes('antiviral')) {
        return 'Chemotherapy & Antimicrobials';
      }
      if (n.includes('endocrine') || n.includes('hormone') || n.includes('git') || n.includes('gastric') || n.includes('autacoid') || n.includes('histamine')) {
        return 'Endocrine & GIT Drugs';
      }
      return 'General & Miscellaneous Pharmacology';

    case 5: // Pathology
      if (n.includes('reversible') || n.includes('cell injury') || n.includes('apoptosis') || n.includes('inflammation') || n.includes('pathology') || n.includes('necrosis') || n.includes('cell death')) {
        return 'General Pathology & Cell Injury';
      }
      if (n.includes('blood') || n.includes('w.b.c') || n.includes('bleeding') || n.includes('immunity') || n.includes('immune') || n.includes('lymph')) {
        return 'Hematology & Immunopathology';
      }
      if (n.includes('neoplasia') || n.includes('tumor') || n.includes('cancer') || n.includes('oncology')) {
        return 'Neoplasia';
      }
      if (n.includes('mendelian') || n.includes('genetic') || n.includes('single-gene') || n.includes('nutrition') || n.includes('environment') || n.includes('pediatric')) {
        return 'Genetics & Pediatric Pathology';
      }
      if (n.includes('cvs') || n.includes('atherosclerosis') || n.includes('vessels') || n.includes('cardiac') || n.includes('respiratory') || n.includes('lung') || n.includes('pneumonia') || n.includes('kidney') || n.includes('liver') || n.includes('git') || n.includes('genital') || n.includes('tract') || n.includes('nervous') || n.includes('brain') || n.includes('breast')) {
        return 'Systemic Pathology';
      }
      return 'General & Miscellaneous Pathology';

    case 6: // Microbiology
      if (n.includes('general micro') || n.includes('immunology') || n.includes('sterilization') || n.includes('disinfection')) {
        return 'General Microbiology & Immunology';
      }
      if (n.includes('bacteriology') || n.includes('bacteria') || n.includes('enterobacteriaceae') || n.includes('cocci') || n.includes('bacillus') || n.includes('gram')) {
        return 'Bacteriology';
      }
      if (n.includes('virology') || n.includes('virus') || n.includes('viral') || n.includes('hiv') || n.includes('influenza') || n.includes('hepatitis')) {
        return 'Virology';
      }
      if (n.includes('mycology') || n.includes('fungi') || n.includes('parasitology') || n.includes('parasite') || n.includes('amoeba') || n.includes('malaria')) {
        return 'Mycology & Parasitology';
      }
      return 'General & Clinical Microbiology';

    case 7: // Forensic Medicine
      if (n.includes('toxicology') || n.includes('poisoning') || n.includes('poison') || n.includes('lead') || n.includes('arsenic')) {
        return 'Forensic Toxicology';
      }
      if (n.includes('jurisprudence') || n.includes('ethics') || n.includes('negligence') || n.includes('law') || n.includes('court')) {
        return 'Medical Jurisprudence & Ethics';
      }
      if (n.includes('thanatology') || n.includes('death') || n.includes('injury') || n.includes('injuries') || n.includes('asphyxia') || n.includes('drowning') || n.includes('burns')) {
        return 'Thanatology & Traumatology';
      }
      if (n.includes('sexual') || n.includes('offenses') || n.includes('offences') || n.includes('rape') || n.includes('pregnancy') || n.includes('infanticide')) {
        return 'Sexual Jurisprudence & Infanticide';
      }
      return 'General & Miscellaneous Forensic Medicine';

    case 8: // PSM
      if (n.includes('health') || n.includes('disease') || n.includes('epidemiology') || n.includes('biostatistics')) {
        return 'Concepts of Health & Epidemiology';
      }
      if (n.includes('communicable') || n.includes('infection') || n.includes('malaria') || n.includes('tuberculosis') || n.includes('aids') || n.includes('hypertension') || n.includes('diabetes')) {
        return 'Communicable & Non-Communicable Diseases';
      }
      if (n.includes('environment') || n.includes('occupational') || n.includes('water') || n.includes('air') || n.includes('radiation')) {
        return 'Environmental & Occupational Health';
      }
      if (n.includes('nutrition') || n.includes('food') || n.includes('maternal') || n.includes('child health') || n.includes('family planning') || n.includes('contraception')) {
        return 'Nutrition & Maternal-Child Health';
      }
      if (n.includes('program') || n.includes('programs') || n.includes('healthcare') || n.includes('admin') || n.includes('management') || n.includes('planning')) {
        return 'National Health Programs & Admin';
      }
      return 'General & Miscellaneous PSM';

    case 9: // Ophthalmology
      if (n.includes('cornea') || n.includes('lens') || n.includes('conjunctiva') || n.includes('sclera') || n.includes('iris') || n.includes('cataract')) {
        return 'Anterior Segment Diseases';
      }
      if (n.includes('retina') || n.includes('optic') || n.includes('glaucoma') || n.includes('vitreous')) {
        return 'Posterior Segment Diseases';
      }
      if (n.includes('refractive') || n.includes('squint') || n.includes('strabismus') || n.includes('myopia')) {
        return 'Refractive Errors & Strabismus';
      }
      if (n.includes('orbit') || n.includes('eyelid') || n.includes('lacrimal')) {
        return 'Orbit & Adnexa';
      }
      return 'General & Clinical Ophthalmology';

    case 10: // ENT
      if (n.includes('ear') || n.includes('vestibular') || n.includes('hearing') || n.includes('tympanic') || n.includes('mastoid') || n.includes('audiology')) {
        return 'Ear & Vestibular Disorders';
      }
      if (n.includes('nose') || n.includes('sinus') || n.includes('sinuses') || n.includes('epistaxis') || n.includes('nasal')) {
        return 'Nose & Sinus Disorders';
      }
      if (n.includes('pharynx') || n.includes('larynx') || n.includes('oral') || n.includes('tonsil') || n.includes('vocal')) {
        return 'Oral Cavity, Pharynx & Larynx';
      }
      return 'General & Clinical ENT';

    case 11: // General Medicine
      if (n.includes('cardiac') || n.includes('coronary') || n.includes('valvular') || n.includes('respiratory') || n.includes('asthma') || n.includes('copd') || n.includes('pleural')) {
        return 'Cardiology & Pulmonology';
      }
      if (n.includes('gastrointestinal') || n.includes('git') || n.includes('liver') || n.includes('hepatitis') || n.includes('pancreas') || n.includes('peptic')) {
        return 'Gastroenterology & Hepatology';
      }
      if (n.includes('kidney') || n.includes('renal') || n.includes('endocrine') || n.includes('diabetes') || n.includes('thyroid') || n.includes('adrenal') || n.includes('pituitary')) {
        return 'Nephrology & Endocrinology';
      }
      if (n.includes('neurology') || n.includes('brain') || n.includes('stroke') || n.includes('myasthenia') || n.includes('muscular') || n.includes('rheumatology') || n.includes('arthritis') || n.includes('joints')) {
        return 'Neurology & Rheumatology';
      }
      if (n.includes('infection') || n.includes('infectious') || n.includes('tb') || n.includes('malaria') || n.includes('blood') || n.includes('anemia') || n.includes('leukemia')) {
        return 'Infectious Diseases & Hematology';
      }
      return 'General & Systemic Medicine';

    case 12: // General Surgery
      if (n.includes('surgery') || n.includes('wound') || n.includes('burns') || n.includes('fluid') || n.includes('shock') || n.includes('trauma') || n.includes('obesity')) {
        return 'General Surgery & Trauma';
      }
      if (n.includes('stomach') || n.includes('duodenum') || n.includes('colon') || n.includes('rectum') || n.includes('appendix') || n.includes('hernia') || n.includes('gallbladder') || n.includes('pancreas') || n.includes('liver')) {
        return 'Gastrointestinal Surgery';
      }
      if (n.includes('breast') || n.includes('thyroid') || n.includes('parathyroid') || n.includes('adrenal') || n.includes('oncology') || n.includes('cancer')) {
        return 'Breast & Endocrine Surgery';
      }
      if (n.includes('urology') || n.includes('kidney') || n.includes('bladder') || n.includes('prostate') || n.includes('testis') || n.includes('scrotum')) {
        return 'Urosurgery';
      }
      if (n.includes('arterial') || n.includes('venous') || n.includes('varicose') || n.includes('aneurysm') || n.includes('chest')) {
        return 'Vascular & Cardiothoracic Surgery';
      }
      return 'General Surgery Specialties';

    case 13: // OBG
      if (n.includes('pregnancy') || n.includes('obstetric') || n.includes('labor') || n.includes('delivery') || n.includes('placenta') || n.includes('fetus') || n.includes('fetal') || n.includes('eclampsia') || n.includes('antenatal')) {
        return 'Obstetrics (Normal & Pathological)';
      }
      if (n.includes('gynaecology') || n.includes('menstrual') || n.includes('uterus') || n.includes('ovary') || n.includes('cervix') || n.includes('vagina') || n.includes('infertility') || n.includes('contraception')) {
        return 'Gynecology (General & Endocrine)';
      }
      if (n.includes('cancer') || n.includes('oncology') || n.includes('mullerian') || n.includes('tumor')) {
        return 'Gynecologic Oncology';
      }
      return 'Obstetrics & Gynecology Specialties';

    case 14: // Pediatrics
      if (n.includes('new born') || n.includes('neonatal') || n.includes('neonate') || n.includes('growth') || n.includes('development') || n.includes('milestones')) {
        return 'Neonatology & Growth';
      }
      if (n.includes('respiratory') || n.includes('cardiology') || n.includes('neurology') || n.includes('git') || n.includes('renal') || n.includes('nephrology')) {
        return 'Pediatric Systemic Diseases';
      }
      if (n.includes('nutrition') || n.includes('malnutrition') || n.includes('rickets') || n.includes('infection') || n.includes('viral') || n.includes('measles') || n.includes('polio')) {
        return 'Nutrition & Infectious Diseases';
      }
      return 'General & Social Pediatrics';

    case 15: // Orthopedics
      if (n.includes('fracture') || n.includes('fractures') || n.includes('dislocation') || n.includes('injury') || n.includes('spine')) {
        return 'Traumatology & Fractures';
      }
      if (n.includes('osteomyelitis') || n.includes('tuberculosis') || n.includes('bone tumor') || n.includes('osteosarcoma')) {
        return 'Bone Infections & Tumors';
      }
      if (n.includes('arthritis') || n.includes('joint') || n.includes('congenital') || n.includes('dislocation of hip') || n.includes('c.d.h.')) {
        return 'Joints & Congenital Disorders';
      }
      return 'General Orthopedics';

    case 16: // Dermatology
      if (n.includes('fungal') || n.includes('bacterial') || n.includes('viral') || n.includes('psoriasis') || n.includes('lichen') || n.includes('eczema')) {
        return 'Infectious & Inflammatory Dermatoses';
      }
      if (n.includes('pemphigus') || n.includes('bullous') || n.includes('hair') || n.includes('nail') || n.includes('alopecia')) {
        return 'Vesiculobullous & Hair/Nail Disorders';
      }
      if (n.includes('syphilis') || n.includes('gonorrhea') || n.includes('leprosy') || n.includes('hiv')) {
        return 'STIs & Leprosy';
      }
      return 'General Dermatology';

    case 17: // Psychiatry
      if (n.includes('depression') || n.includes('mania') || n.includes('bipolar') || n.includes('anxiety') || n.includes('schizophrenia') || n.includes('psychosis')) {
        return 'Mood, Anxiety & Schizophrenia';
      }
      if (n.includes('alcohol') || n.includes('substance') || n.includes('addiction') || n.includes('dementia') || n.includes('delirium')) {
        return 'Substance Abuse & Organic Disorders';
      }
      if (n.includes('child psychiatry') || n.includes('adhd') || n.includes('autism') || n.includes('personality')) {
        return 'Child & Personality Disorders';
      }
      if (n.includes('treatment') || n.includes('therapy') || n.includes('ect') || n.includes('drug')) {
        return 'Treatments & Therapeutics';
      }
      return 'General Psychiatry';

    case 18: // Radiology
      if (n.includes('radiography') || n.includes('x-ray') || n.includes('ultrasound') || n.includes('usg') || n.includes('ct') || n.includes('mri')) {
        return 'Diagnostic Radiology & Imaging';
      }
      if (n.includes('chest imaging') || n.includes('abdominal radiography') || n.includes('head and neck imaging')) {
        return 'Systemic Radiology';
      }
      if (n.includes('nuclear') || n.includes('radiation') || n.includes('contrast')) {
        return 'Nuclear Medicine & Radiation Physics';
      }
      return 'General & Interventional Radiology';

    case 19: // Anesthesia
      if (n.includes('anesthesia') || n.includes('general anesthetic') || n.includes('local anesthetic') || n.includes('gas') || n.includes('inhalational') || n.includes('relaxant') || n.includes('intravenous') || n.includes('agent') || n.includes('agents')) {
        return 'Anesthesia Principles & Pharmacology';
      }
      if (n.includes('monitoring') || n.includes('ventilation') || n.includes('resuscitation') || n.includes('icu') || n.includes('intubation')) {
        return 'Monitoring, Resuscitation & ICU';
      }
      return 'General Anesthesia Specialties';

    case 20: // Dental
      if (n.includes('oral') || n.includes('dental') || n.includes('caries') || n.includes('periodontal') || n.includes('maxillofacial')) {
        return 'Oral Medicine, Surgery & Pathology';
      }
      return 'General Dentistry';

    default:
      return 'General Medical Sciences';
  }
}

export function getSubjectHierarchy(subjectId: number): SubjectHierarchy {
  const filtered = typedRawTopics.filter(t => t.subjectId === subjectId);
  const topicMap: Record<string, SubTopicNode[]> = {};

  filtered.forEach(t => {
    const topicCategory = classifyTopic(subjectId, t.name);
    if (!topicMap[topicCategory]) {
      topicMap[topicCategory] = [];
    }
    topicMap[topicCategory].push({
      id: t.id,
      subjectId: t.subjectId,
      name: t.name,
      count: t.count
    });
  });

  const topics: TopicNode[] = Object.keys(topicMap).map(name => {
    const subTopics = topicMap[name];
    const count = subTopics.reduce((sum, curr) => sum + curr.count, 0);
    // Sort subtopics alphabetically by name for UI beauty
    subTopics.sort((a, b) => a.name.localeCompare(b.name));
    return {
      name,
      subTopics,
      count
    };
  });

  // Sort main topics alphabetically for consistency, except place "General & Miscellaneous" or similar at the end
  topics.sort((a, b) => {
    const aIsMisc = a.name.toLowerCase().includes('misc') || a.name.toLowerCase().includes('general');
    const bIsMisc = b.name.toLowerCase().includes('misc') || b.name.toLowerCase().includes('general');
    if (aIsMisc && !bIsMisc) return 1;
    if (!aIsMisc && bIsMisc) return -1;
    return a.name.localeCompare(b.name);
  });

  return {
    subjectId,
    topics
  };
}
